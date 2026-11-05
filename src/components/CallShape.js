import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Polygon, Rect, Circle, Line } from 'react-native-svg';
import { CALL_SHAPES } from '../constants/theme';

// A call's shape with its letter inside: A triangle, B square, C circle.
// Thin lines and a light letter, like the home screen's button and title.
// lineWidth is in screen points, whatever the size.
export function CallShape({ call, size, color, lineWidth = size < 60 ? 1.5 : 2.5 }) {
  const shape = CALL_SHAPES[call];
  const stroke = (lineWidth * 100) / size; // in viewBox units
  const inset = stroke / 2 + 1;
  // The triangle's letter sits low, where the triangle is widest.
  const letterOffset = shape === 'triangle' ? size * 0.16 : 0;
  const line = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinejoin: 'round' };
  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`Call ${call.toUpperCase()}`}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {shape === 'triangle' && <Polygon points={`50,${inset + 4} ${100 - inset},${92 - inset} ${inset},${92 - inset}`} {...line} />}
        {shape === 'square' && <Rect x={inset + 4} y={inset + 4} width={92 - 2 * inset} height={92 - 2 * inset} rx={14} {...line} />}
        {shape === 'circle' && <Circle cx={50} cy={50} r={48 - inset} {...line} />}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.letterWrap, { paddingTop: letterOffset }]}>
        <Text
          allowFontScaling={false}
          style={{ color, fontSize: size * 0.4, fontWeight: size < 60 ? '400' : '200' }}
        >
          {call.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// The ECG trace from the app icon (randoro-icon.svg), the Classic call's symbol.
const TRACE = 'M 0,471 L 103,471 Q 156.5,358 210,471 L 305,471 L 350,579 L 362.7,471 L 406,101.5 L 443.6,471 L 464,672 L 515,471 L 607,471 Q 662.5,280 718,471 L 813,471';
const R_SPIKE = 'M 362.7,471 L 406,101.5 L 443.6,471';

export function RandoroSymbol({ width, color, spikeColor = color, lineWidth = 2.5 }) {
  const height = width * (620 / 813);
  const stroke = (lineWidth * 813) / width; // in viewBox units
  return (
    <Svg width={width} height={height} viewBox="0 80 813 620" accessibilityLabel="Beep">
      <Path d={TRACE} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={R_SPIKE} fill="none" stroke={spikeColor} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SpeakerIcon({ size = 20, color = '#374151' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9h4l5-4v14l-5-4H4z" fill={color} />
      <Path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function Chevron({ direction = 'down', size = 14, color = '#374151' }) {
  const d = direction === 'up' ? 'M4 15l8-8 8 8' : 'M4 9l8 8 8-8';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// A vertical dashed or dotted line that fills its parent's height. It's drawn
// absolutely, so it takes the parent's height without setting it.
export function VerticalRule({ color, dash = '4 4', width = 1.5, round }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Line
        x1="50%" y1={width} x2="50%" y2="100%"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap={round ? 'round' : 'butt'}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  letterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
