import React from 'react';

interface DooRareBotAvatarProps {
  size?: number;
  className?: string;
}

/**
 * Custom DooRare Medical Robot Copilot Mascot
 * A cute, modern healthcare assistant bot styled for DooRare (medical cyan/blue theme)
 */
export const DooRareBotAvatar: React.FC<DooRareBotAvatarProps> = ({ size = 32, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="DooRare AI Robot"
    >
      <defs>
        {/* Antennas & Ears Medical Cyan/Blue Gradient */}
        <linearGradient id="doorareEarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        {/* Head Outer Glow / Gradient */}
        <linearGradient id="doorareHeadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f9ff" />
        </linearGradient>

        {/* Helmet Outer Border Accent */}
        <linearGradient id="doorareBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        {/* Face Screen Glow */}
        <linearGradient id="doorareFaceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>

      {/* Top Antenna Light & Stem */}
      <rect x="22.5" y="4" width="3" height="6" rx="1.5" fill="url(#doorareEarGrad)" />
      <circle cx="24" cy="4" r="3.5" fill="#38bdf8" />
      <circle cx="24" cy="4" r="1.5" fill="#ffffff" />

      {/* Left Headphone Ear */}
      <rect x="2" y="19" width="5.5" height="11" rx="2.75" fill="url(#doorareEarGrad)" />
      {/* Right Headphone Ear */}
      <rect x="40.5" y="19" width="5.5" height="11" rx="2.75" fill="url(#doorareEarGrad)" />

      {/* Outer Head Helmet */}
      <rect
        x="6"
        y="9"
        width="36"
        height="32"
        rx="14"
        fill="url(#doorareHeadGrad)"
        stroke="url(#doorareBorderGrad)"
        strokeWidth="2.5"
      />

      {/* Inner Visor / Face Screen */}
      <rect
        x="10.5"
        y="14"
        width="27"
        height="22"
        rx="9.5"
        fill="url(#doorareFaceGrad)"
      />

      {/* Eye Left (Warm, Friendly Eye with twinkle) */}
      <ellipse cx="18" cy="23.5" rx="2.2" ry="2.8" fill="#0f172a" />
      <circle cx="18.8" cy="22.5" r="0.9" fill="#ffffff" />

      {/* Eye Right */}
      <ellipse cx="30" cy="23.5" rx="2.2" ry="2.8" fill="#0f172a" />
      <circle cx="30.8" cy="22.5" r="0.9" fill="#ffffff" />

      {/* Cute Cheeks */}
      <circle cx="14" cy="27" r="1.8" fill="#fda4af" opacity="0.65" />
      <circle cx="34" cy="27" r="1.8" fill="#fda4af" opacity="0.65" />

      {/* Sweet Smile */}
      <path
        d="M20.5 28.5C21.6 30.2 26.4 30.2 27.5 28.5"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};
