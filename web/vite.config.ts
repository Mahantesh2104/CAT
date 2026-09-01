import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import basicSsl from "@vitejs/plugin-basic-ssl"
import path from "path"

/**
 * `npm run dev`        http on localhost — desktop work.
 * `npm run dev:phone`  https on every interface — the ONLY way a real phone can use the
 *                      camera. getUserMedia requires a secure context: localhost counts,
 *                      http://192.168.x.x does not. Over plain LAN http the browser
 *                      blocks the camera before any of our code runs, so the scan page
 *                      could only ever show its fallback.
 *
 * The certificate is self-signed, so the phone shows a warning once — tap through it.
 */
export default defineConfig(({ mode }) => {
  const phone = mode === "phone"
  return {
    plugins: [react(), tailwindcss(), ...(phone ? [basicSsl()] : [])],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: 5199,
      strictPort: true,
      host: phone ? true : "localhost",
    },
  }
})
