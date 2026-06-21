const MAIN_TABS = [
  { id: 'gacha',   label: '뽑기' },
  { id: 'synth',   label: '공방' },
  { id: 'dungeon', label: '던전' },
  { id: 'bag',     label: '가방' },
  { id: 'raid',    label: '레이드' },
];

const MORE_TABS = [
  { id: 'shop',    label: '상점' },
  { id: 'board',   label: '게시판' },
  { id: 'mailbox', label: '우편함' },
  { id: 'ranking', label: '랭킹' },
];

const MORE_IDS = new Set(MORE_TABS.map(t => t.id));

export default function TabBar({ activeTab, onTabChange, moreOpen, onMoreToggle, hasUnreadMail }) {
  const isMoreActive = MORE_IDS.has(activeTab);

  const handleMoreTabClick = (tabId) => {
    onTabChange(tabId);
    if (moreOpen) onMoreToggle();
  };

  return (
    <div className="tab-bar-wrap">
      <div className="page-tabs">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.id}
            data-tut={tab.id}
            className={`page-tab${activeTab === tab.id ? ' active' : ''}${tab.id === 'raid' ? ' raid-tab' : ''}${tab.id === 'dungeon' ? ' dungeon-tab' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button
          className={`page-tab more-tab${(moreOpen || isMoreActive) ? ' active' : ''}`}
          onClick={onMoreToggle}
          style={{ position: 'relative' }}
        >
          더보기 {moreOpen ? '▲' : '▼'}
          {hasUnreadMail && <span className="more-unread-dot" />}
        </button>
      </div>

      <div className={`more-drawer${moreOpen ? ' open' : ''}`}>
        <div className="more-drawer-inner">
          {MORE_TABS.map(tab => (
            <button
              key={tab.id}
              className={`more-drawer-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => handleMoreTabClick(tab.id)}
              style={{ position: 'relative' }}
            >
              {tab.label}
              {tab.id === 'mailbox' && hasUnreadMail && <span className="more-unread-dot" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
