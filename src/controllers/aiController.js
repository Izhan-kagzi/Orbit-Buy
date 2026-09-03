const { readDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function getConfig() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  if (!apiKey || apiKey === "REPLACE_WITH_YOUR_NEW_GROQ_KEY") {
    throw new ApiError(
      503,
      "AI Stylist is not configured. Add your GROQ_API_KEY to backend/.env and restart the backend."
    );
  }

  return { apiKey, model };
}

function toPromptProduct(p) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    type: p.type,
    price: p.price,
    oldPrice: p.oldPrice,
    sizes: p.sizes,
    rating: p.rating,
    stock: p.stock,
    description: String(p.description || "").slice(0, 180),
  };
}

function extractJson(text) {
  if (!text || typeof text !== "string") throw new Error("Empty AI response.");
  let cleaned = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart === -1 || objectEnd === -1 || objectEnd <= objectStart) {
    throw new Error("AI did not return a JSON object.");
  }
  return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
}

async function callGroq({ system, prompt, temperature = 0.3 }) {
  const { apiKey, model } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`Groq returned a non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
      const error = new Error(
        data?.error?.message || data?.message || `Groq request failed with status ${response.status}.`
      );
      error.status = response.status;
      throw error;
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq returned an empty response.");
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("Groq request timed out.");
      timeoutError.code = "GROQ_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeId(id) {
  return id === undefined || id === null ? "" : String(id);
}

// Rank products locally before sending them to Groq. This is important on
// Groq's lower TPM tiers: sending the whole catalog can exceed the per-minute
// input-token limit before the model even gets a chance to answer.
function selectCandidates(products, query, limit = 24) {
  const text = String(query || "").toLowerCase();
  const words = text
    .replace(/[^a-z0-9₹]+/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const budgetMatch = text.match(/(?:under|below|less than|upto|up to|within|around)\s*₹?\s*(\d[\d,]*)/i);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : null;

  const scored = products.map((p, index) => {
    const searchable = [p.name, p.brand, p.category, p.type, p.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const word of words) {
      if (searchable.includes(word)) score += 3;
    }

    if (budget !== null && Number(p.price) <= budget) score += 8;
    if (budget !== null && Number(p.price) > budget) score -= 4;
    if (Number(p.rating)) score += Math.min(Number(p.rating), 5) * 0.5;

    return { p, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(({ p }) => p);
}

// ============================================================
// PRODUCT COMPARISON
// POST /api/ai/compare
// { productIds: [id, id, ...] }
// ============================================================
const compareProducts = asyncHandler(async (req, res) => {
  const { productIds } = req.body || {};

  if (!Array.isArray(productIds) || productIds.length < 2) {
    throw new ApiError(400, "Provide at least 2 productIds to compare.");
  }
  if (productIds.length > 4) {
    throw new ApiError(400, "You can compare up to 4 products at a time.");
  }

  const uniqueIds = [...new Set(productIds.map(normalizeId).filter(Boolean))];
  const db = readDB();
  const products = uniqueIds
    .map((id) => db.products.find((p) => normalizeId(p.id) === id))
    .filter(Boolean);

  if (products.length < 2) {
    throw new ApiError(404, "Couldn't find enough of those products.");
  }

  const prompt = `
Compare these Orbit Buy clothing products for a shopper.

PRODUCTS:
${JSON.stringify(products.map(toPromptProduct))}

Return ONLY this JSON shape:
{
  "summary": "2-3 sentence overview",
  "points": [
    {"label":"Best Value","productId":"<id>","reason":"one short sentence"},
    {"label":"Best Quality/Rating","productId":"<id>","reason":"one short sentence"},
    {"label":"Best For","productId":"<id>","reason":"one short sentence"}
  ],
  "recommendation": {"productId":"<id>","reason":"1-2 sentence justification"}
}

Use ONLY these product IDs: ${products.map((p) => p.id).join(", ")}.
Never invent products or IDs. Return JSON only.
`;

  let text;
  try {
    text = await callGroq({
      system: "You are Orbit Buy's shopping comparison assistant. Return only valid JSON.",
      prompt,
      temperature: 0.2,
    });
  } catch (error) {
    console.error("Groq comparison error:", error);
    throw new ApiError(502, "The AI comparison service is unavailable right now. Please check your Groq API key/model and try again.");
  }

  let parsed;
  try {
    parsed = extractJson(text);
  } catch (error) {
    console.error("Groq comparison JSON error:", error.message);
    throw new ApiError(502, "The AI returned an invalid comparison. Please try again.");
  }

  const validIds = new Set(products.map((p) => normalizeId(p.id)));
  const points = Array.isArray(parsed.points)
    ? parsed.points.filter((x) => validIds.has(normalizeId(x?.productId))).map((x) => ({
        label: String(x.label || "Highlight"),
        productId: normalizeId(x.productId),
        reason: String(x.reason || "A strong option based on the catalog data."),
      })).slice(0, 3)
    : [];

  let recommendation = null;
  if (parsed.recommendation && validIds.has(normalizeId(parsed.recommendation.productId))) {
    recommendation = {
      productId: normalizeId(parsed.recommendation.productId),
      reason: String(parsed.recommendation.reason || "Best overall match based on the catalog data."),
    };
  }

  res.json({
    success: true,
    products,
    comparison: {
      summary: String(parsed.summary || "These products have different strengths based on price, rating, style, and availability."),
      points,
      recommendation,
    },
  });
});

// ============================================================
// AI STYLIST
// POST /api/ai/recommend
// { query: "...", category: "All" }
// ============================================================
const recommendProducts = asyncHandler(async (req, res) => {
  const { query, category } = req.body || {};
  const shopperQuery = String(query || "").trim();

  if (!shopperQuery) {
    throw new ApiError(400, "Tell the AI what you're looking for.");
  }

  const db = readDB();
  let candidates = db.products.filter((p) => Number(p.stock) > 0);

  if (category && category !== "All") {
    candidates = candidates.filter(
      (p) => String(p.category).toLowerCase() === String(category).toLowerCase()
    );
  }

  if (candidates.length === 0) {
    return res.json({
      success: true,
      message: "I couldn't find any currently available products in this category.",
      recommendations: [],
    });
  }

  // IMPORTANT: Never send the entire catalog to Groq. The previous version
  // sent up to 120 products and produced a 15,830-token request, while the
  // user's Groq tier has an 8,000 TPM limit. Keep the AI input comfortably
  // below that limit by ranking locally and sending only 24 compact products.
  const aiCandidates = selectCandidates(candidates, shopperQuery, 24);
  const promptProducts = aiCandidates.map(toPromptProduct);

  const prompt = `
You are Orbit Buy's friendly AI shopping stylist.

SHOPPER REQUEST:
${shopperQuery.slice(0, 500)}

SELECTED CATEGORY:
${category || "All"}

MATCH THESE PRODUCTS:
${JSON.stringify(promptProducts)}

Choose the 3 to 6 BEST matching products.
Consider clothing type, gender/category, budget, occasion, style, description, rating, stock, brand and sizes.

Return ONLY valid JSON in exactly this shape:
{
  "message": "1-2 friendly sentences explaining the recommendations",
  "recommendations": [
    {"productId":"<id>","reason":"one short sentence explaining why this product fits"}
  ]
}

Rules:
- Use ONLY the supplied products.
- Never invent products or product IDs.
- Every productId must exactly match a supplied ID.
- Only recommend products with stock greater than 0.
- Return at most 6 recommendations.
- Return JSON only.

AVAILABLE PRODUCT IDS:
${aiCandidates.map((p) => p.id).join(", ")}
`;

  let text;
  try {
    text = await callGroq({
      system: "You are Orbit Buy's AI stylist. Match shoppers to real in-stock products only. Return valid JSON only.",
      prompt,
      temperature: 0.25,
    });
  } catch (error) {
    console.error("Groq stylist error:", error);
    const providerMessage = String(error?.message || "");

    if (error?.status === 413 || /request too large|tokens per minute|TPM/i.test(providerMessage)) {
      throw new ApiError(413, "The AI request was too large for the current Groq limit. Please try a more specific request.");
    }
    if (error?.status === 401 || error?.status === 403) {
      throw new ApiError(502, "Your Groq API key is invalid or not authorized. Check backend/.env and restart the backend.");
    }
    throw new ApiError(502, "The AI stylist is unavailable right now. Please check your Groq API key/model and try again.");
  }

  let parsed;
  try {
    parsed = extractJson(text);
  } catch (error) {
    console.error("Groq stylist JSON error:", error.message);
    console.error("Groq response:", text);
    throw new ApiError(502, "The AI returned an invalid recommendation. Please try again.");
  }

  const productMap = new Map(candidates.map((p) => [normalizeId(p.id), p]));
  const seen = new Set();

  const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
    .map((item) => {
      const id = normalizeId(item?.productId);
      const product = productMap.get(id);
      if (!product || seen.has(id)) return null;
      seen.add(id);
      return {
        ...toPromptProduct(product),
        image: product.image || "",
        reason: String(item?.reason || "This product matches your request."),
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  res.json({
    success: true,
    message: String(
      parsed.message ||
      (recommendations.length
        ? "Here are some picks that match your request."
        : "I couldn't find a close match. Try adding a color, budget, occasion, or clothing type.")
    ),
    recommendations,
  });
});

module.exports = { compareProducts, recommendProducts };
