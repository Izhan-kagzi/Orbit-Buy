/**
 * Live order tracking: SSE hub + Web Push + status copy.
 *
 * - SSE keeps every open tab/device of a customer in sync instantly.
 * - Web Push delivers the notification when the tab/app is closed
 *   (desktop browsers, Android, and iOS 16.4+ PWAs added to Home Screen).
 *
 * The SSE hub is in-memory: fine for a single Render instance. Running
 * several instances would need a shared bus (Redis pub/sub) in emitToUser.
 */
const PushSubscription = require("../models/PushSubscription");

/* ---------------------------- Status copy ---------------------------- */

const STATUS_COPY = {
  Pending: { title: "Order received", body: "We've received your order and will confirm it shortly." },
  Confirmed: { title: "Order confirmed", body: "Your order is confirmed and being prepared." },
  Processing: { title: "Preparing your order", body: "Your items are being packed." },
  Shipped: { title: "Order shipped", body: "Your order is on its way." },
  Delivered: { title: "Order delivered", body: "Your order has been delivered. Enjoy!" },
  Cancelled: { title: "Order cancelled", body: "Your order has been cancelled." },
};

/** Compact, client-ready snapshot. Shaped like an iOS Live Activity
 *  "content state" so a native app could reuse it unchanged. */
function toLivePayload(order) {
  const o = typeof order.toJSON === "function" ? order.toJSON() : order;
  const first = o.items?.[0];
  return {
    id: o.id,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: o.total,
    itemCount: (o.items || []).reduce((n, i) => n + (i.quantity || 1), 0),
    firstItemName: first?.name || "",
    firstItemImage: first?.image || null,
    cancellation: o.cancellation?.status || null,
    live: {
      active: !!o.live?.active,
      openedAt: o.live?.openedAt || null,
      closedAt: o.live?.closedAt || null,
      closeReason: o.live?.closeReason || null,
    },
    timeline: (o.timeline || []).map((t) => ({ status: t.status, at: t.at })),
    updatedAt: o.updatedAt || new Date().toISOString(),
  };
}

/* ------------------------------- SSE hub ------------------------------ */

const clients = new Map(); // userId -> Set<res>

function subscribe(userId, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering (nginx / Render)
  });
  res.write("retry: 5000\n\n");

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);

  res.on("close", () => {
    clearInterval(heartbeat);
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(userId);
    }
  });
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function emitToUser(userId, event, data) {
  const set = clients.get(String(userId));
  if (!set) return;
  for (const res of set) {
    try {
      send(res, event, data);
    } catch {
      /* closed socket — cleaned up by its close handler */
    }
  }
}

/* ------------------------------ Web Push ------------------------------ */

let webpush = null;
let pushReady = false;

function initPush() {
  if (pushReady) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  try {
    webpush = require("web-push");
    webpush.setVapidDetails(
      VAPID_SUBJECT || "mailto:support@orbitbuy.app",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    pushReady = true;
  } catch (e) {
    console.warn("[push] web-push unavailable (run `npm i web-push`):", e.message);
  }
  return pushReady;
}

async function pushToUser(userId, notification) {
  if (!initPush()) return;
  const subs = await PushSubscription.find({ userId: String(userId) });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(notification),
          { TTL: 60 * 60 * 24 }
        );
      } catch (err) {
        // 404/410 = subscription expired or revoked.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.warn("[push] send failed:", err.statusCode || err.message);
        }
      }
    })
  );
}

/* --------------------------- Public helpers --------------------------- */

/** Push the order's new state to the customer: live stream + notification. */
function notifyOrderUpdate(order, { push = true, title, body } = {}) {
  const payload = toLivePayload(order);
  emitToUser(order.userId, "order:update", payload);

  if (push) {
    const copy = STATUS_COPY[order.status] || {};
    pushToUser(order.userId, {
      type: "order:update",
      orderId: order.id || order._id,
      title: title || `${copy.title || "Order update"} · #${order.id || order._id}`,
      body: body || copy.body || `Status: ${order.status}`,
      tag: `order-${order.id || order._id}`, // replaces the previous notification
      url: "/orders",
      live: payload.live,
    }).catch((e) => console.warn("[push]", e.message));
  }
}

/** Tell the customer's devices the live tracker is finished and must go away. */
function notifyLiveClosed(order) {
  const payload = toLivePayload(order);
  emitToUser(order.userId, "order:live-closed", payload);
  // Silent push so a closed PWA/tab can drop the lingering notification.
  pushToUser(order.userId, {
    type: "order:live-closed",
    orderId: order.id || order._id,
    tag: `order-${order.id || order._id}`,
    silent: true,
  }).catch((e) => console.warn("[push]", e.message));
}

module.exports = {
  STATUS_COPY,
  toLivePayload,
  subscribe,
  emitToUser,
  notifyOrderUpdate,
  notifyLiveClosed,
  initPush,
};
