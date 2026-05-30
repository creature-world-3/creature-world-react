const TABS = [
  { id: 'gacha',   label: '뽑기' },
  { id: 'synth',   label: '합성' },
  { id: 'shop',    label: '상점' },
  { id: 'dex',     label: '도감' },
  { id: 'board',   label: '게시판' },
  { id: 'trade',   label: '거래소' },
  { id: 'raid',    label: '레이드' },
];

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="page-tabs">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`page-tab${activeTab === tab.id ? ' active' : ''}${tab.id === 'raid' ? ' raid-tab' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
