import type { MetadataRoute } from "next";

/** Makes ServerSentry installable as an app from the browser: no downloads, installers or command line for users. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ServerSentry",
    short_name: "ServerSentry",
    description: "Know who you're playing with. Community-powered gaming reputation.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08070D",
    theme_color: "#08070D",
    categories: ["games", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
