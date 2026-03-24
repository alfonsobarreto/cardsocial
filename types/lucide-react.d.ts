declare module 'lucide-react' {
  import * as React from 'react';

  export interface LucideProps extends React.SVGProps<SVGSVGElement> {
    size?: string | number;
  }

  export const Apple: React.FC<LucideProps>;
  export const Chrome: React.FC<LucideProps>;
  export const Github: React.FC<LucideProps>;
  export const Lock: React.FC<LucideProps>;
  export const Sparkles: React.FC<LucideProps>;
  export const User: React.FC<LucideProps>;
  export const Database: React.FC<LucideProps>;
  export const CreditCard: React.FC<LucideProps>;
  export const Users: React.FC<LucideProps>;
  export const Search: React.FC<LucideProps>;
  export const PlayCircle: React.FC<LucideProps>;
  export const Phone: React.FC<LucideProps>;

  // Add other icons as needed
}