// A 3 MiB image becomes 4 MiB of base64, leaving room for the JSON envelope
// within the hosting platform's request-body limit. Shared by upload UI and API.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BASE64_CHARS = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
export const MAX_VISION_REQUEST_BYTES = MAX_IMAGE_BASE64_CHARS + 16 * 1024;
