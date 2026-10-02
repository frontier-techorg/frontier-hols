import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    // Browser loads the S3 file directly. The dev optimizer fetch times out
    // on these large PNGs and the card renders a broken image.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "frontiercms.s3.us-east-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/affiliate/referrals", destination: "/affiliate/customers", permanent: false },
      { source: "/affiliate/earnings", destination: "/affiliate/payout", permanent: false },
      { source: "/admin/plans", destination: "/admin/profile/plans", permanent: false },
      { source: "/admin/sales", destination: "/admin", permanent: false },
    ];
  },
};

export default nextConfig;
