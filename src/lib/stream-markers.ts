// Control-char delimiters that split the model's reasoning ("思考过程") prefix from
// the reply content inside the deep-mode chat stream. STX (U+0002) / ETX (U+0003)
// never appear in natural model output, so they survive the reply-cleaning pipeline
// and let the client route thinking tokens to a collapsible panel and answer tokens
// to the bubble. Pure constants — safe to import from both server and client.
export const REASONING_OPEN = String.fromCharCode(2);
export const REASONING_CLOSE = String.fromCharCode(3);
