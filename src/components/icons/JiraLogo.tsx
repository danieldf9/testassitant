import type { SVGProps } from 'react';

export function JiraLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      suppressHydrationWarning
      {...props}
    >
      <path d="M12.01,2.28a1.9,1.9,0,0,0-1.61,2.97L12,8.21l3.53-3.53A1.91,1.91,0,0,0,12.01,2.28Z" />
      <path d="M14.35,6.29,10.41,10.23,7.45,7.28a1.9,1.9,0,0,0-2.7,2.68L8.69,14,4.75,17.94a1.9,1.9,0,1,0,2.69,2.69L11.31,16.7l3.94,3.94A1.91,1.91,0,0,0,18,17.72V9A1.91,1.91,0,0,0,14.35,6.29Z" />
    </svg>
  );
}
