import { pageFile } from "./page";

export default {
  fetch(request: Request): Response {
    return pageFile(new URL(request.url).pathname) ?? new Response("Not found.", { status: 404 });
  },
};
