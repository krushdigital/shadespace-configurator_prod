import mongoose from "mongoose";
const shopSchema = mongoose.Schema({}, { strict: false });

export const ShopifySession = mongoose.models.shopify_sessions || mongoose.model("shopify_sessions", shopSchema);