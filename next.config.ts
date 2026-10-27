import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Fotos de lugares: solo Wikimedia Commons (con autor y licencia visibles en la ficha).
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "thumb.wikimedia.org" },
    ],
  },
};

export default nextConfig;
