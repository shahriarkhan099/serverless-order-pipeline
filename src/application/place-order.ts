import { assertOrderInput, type PlaceOrderInput } from "../domain/order.js";
import type { OrderStore } from "./ports.js";

export async function placeOrder(store: OrderStore, input: PlaceOrderInput) {
  return store.place(assertOrderInput(input));
}
