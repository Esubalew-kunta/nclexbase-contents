/** A user-attached picture on the question slide.
 *
 *  Its height is fixed by CSS from the natural aspect ratio (capped), not by the
 *  decoded bitmap: the paginator measures every block synchronously, before an
 *  image has loaded, so an <img> that sized itself from its pixels would measure
 *  as 0px tall and the slide would be packed as if the picture were not there. */
export function QuestionImageBlock({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <div style={{ padding: "4px 0 20px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        style={{
          display: "block",
          width: "100%",
          aspectRatio: `${width} / ${height}`,
          maxHeight: "calc(440px * var(--density-scale, 1))",
          objectFit: "contain",
          borderRadius: 16,
        }}
      />
    </div>
  );
}
