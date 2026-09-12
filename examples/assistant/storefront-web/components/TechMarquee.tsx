/**
 * Material & Tech corridor — a single slow infinite marquee of the
 * fabric and hardware specifications behind the catalog. Fictional
 * generic specs only; no third-party brand marks.
 */
const MATERIALS = [
  "900FP 拒水鹅绒",
  "15D 双面硅抗撕裂尼龙",
  "7001 航空铝帐杆",
  "碳纤维复合杖杆",
  "全缝线压胶工艺",
  "-12°C 温标实测",
  "10,000mm 静水压",
  "Y 型防风地钉系统",
];

export function TechMarquee() {
  const row = [...MATERIALS, ...MATERIALS];
  return (
    <div className="tech-marquee" aria-hidden="true">
      <div className="tech-marquee-track" data-marquee-track>
        {row.map((item, i) => (
          <span key={`${item}-${i}`} className="tech-marquee-item">
            <span className="marquee-tick" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
