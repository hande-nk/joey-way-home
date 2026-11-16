import { spriteToSvgRects, type Sprite } from '@/lib/sprites';

/** Renders a text sprite as crisp SVG, for HUD icons (lives, mascots). */
export default function PixelSprite({ sprite, scale = 2, dim = false, title }: { sprite: Sprite; scale?: number; dim?: boolean; title?: string }) {
  const width = Math.max(...sprite.map((row) => row.length));
  const height = sprite.length;
  return (
    <svg
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      style={{ opacity: dim ? 0.2 : 1 }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {spriteToSvgRects(sprite).map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
