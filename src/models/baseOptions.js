/**
 * Shared schema options.
 *
 * Every document is serialised with a plain string `id` field and no
 * `_id` / `__v`, so the JSON the API returns keeps exactly the same
 * shape the frontend already consumes from the old db.json backend.
 */
const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};

const baseOptions = {
  timestamps: true,
  toJSON: jsonOptions,
  toObject: jsonOptions,
};

module.exports = { baseOptions, jsonOptions };
