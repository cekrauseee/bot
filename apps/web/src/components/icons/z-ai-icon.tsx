import type { SVGProps } from "react";

/** Z.ai brand mark, adapted from the official z.ai logo asset. */
export function ZAiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect
        x="1.49"
        y="1.49"
        width="27.02"
        height="27.02"
        rx="4"
        fill="#2D2D2D"
        stroke="#FFFFFF"
        strokeWidth="0.63"
      />
      <path
        d="M15.47 7.1 14.17 8.95c-.2.29-.54.47-.9.47h-7.1V7.1h9.3Z"
        fill="#FFFFFF"
      />
      <path d="m24.3 7.1-11.16 15.81H5.7L16.86 7.1h7.44Z" fill="#FFFFFF" />
      <path
        d="m14.53 22.91 1.31-1.86c.2-.29.54-.47.9-.47h7.09v2.33h-9.3Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
