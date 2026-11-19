import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keyprint",
    short_name: "Keyprint",
    description:
      "Your apartment. Its history. Your proof. Renter-owned 3D record and protected security deposit.",
    start_url: "/home",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#faf8f5",
    theme_color: "#161616",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Seal solo apartment",
        short_name: "Solo scan",
        url: "/unit/new",
      },
      {
        name: "Verify a sealed file",
        short_name: "Verify",
        url: "/verify",
      },
      {
        name: "3D apartment demo",
        short_name: "3D Demo",
        url: "/sample",
      },
    ],
  };
}
