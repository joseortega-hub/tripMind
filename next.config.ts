import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador de desarrollo tapa la barra inferior de móvil (Mapa · Lista · …).
  devIndicators: false,
  images: {
    // Fotos de lugares: solo Wikimedia Commons (con autor y licencia visibles en la ficha).
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "thumb.wikimedia.org" },
    ],
  },
};

export default nextConfig;
