import Svg, { Circle, Path } from 'react-native-svg';

type P = { size: number; color: string };

export const Sliders = ({ size, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
    <Path d="M4 7h9M18 7h2M4 17h3M12 17h8" />
    <Circle cx={15.5} cy={7} r={2.3} />
    <Circle cx={9.5} cy={17} r={2.3} />
  </Svg>
);

export const ChevronLeft = ({ size, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const ChevronRight = ({ size, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M9 5l7 7-7 7" />
  </Svg>
);

export const Check = ({ size, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const Minus = ({ size, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
    <Path d="M5 12h14" />
  </Svg>
);

export const Plus = ({ size, color }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);
