const GRADES = ['n', 'r', 'sr', 'ur', 'lg'];
const GRADE_LABEL = { n: 'N', r: 'R', sr: 'SR', ur: 'UR', lg: 'LEGEND' };
const GRADE_COLOR = { n: '#aaa', r: '#4a9eff', sr: '#c084fc', ur: '#fbbf24', lg: '#ff6b6b' };

export default function BagTab({ gs }) {
  const stones = gs?.enhanceStones || {};

  return (
    <div className="bag-wrap">
      <div className="bag-header">
        <div className="col-title">가방</div>
        <div className="col-count">인벤토리</div>
      </div>

      <div className="bag-section">
        <div className="bag-section-title">강화석</div>
        <div className="bag-section-hint">성장 던전 클리어 시 등급별 강화석을 획득합니다.</div>
        <div className="bag-stones-grid">
          {GRADES.map(grade => (
            <div key={grade} className="bag-stone-item">
              <div className="bag-stone-icon" style={{ background: `${GRADE_COLOR[grade]}22`, border: `2px solid ${GRADE_COLOR[grade]}88` }}>
                <div className="bag-stone-gem" style={{ background: GRADE_COLOR[grade] }} />
              </div>
              <div className="bag-stone-grade" style={{ color: GRADE_COLOR[grade] }}>{GRADE_LABEL[grade]}</div>
              <div className="bag-stone-count">{stones[grade] || 0}<span className="bag-stone-unit">개</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
