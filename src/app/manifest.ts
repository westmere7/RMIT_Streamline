import type { MetadataRoute } from "next";

/**
 * What a phone needs to put Streamline on its home screen as an app of its own:
 * a name under the icon, full screen without the browser's bars, and the red
 * tile. Android also asks for a maskable icon it can crop to its own shape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Streamline",
    short_name: "Streamline",
    description: "From brief to report, in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
