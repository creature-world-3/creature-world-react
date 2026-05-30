import { useNavigate } from 'react-router-dom';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="policy-wrap">
      <div className="policy-header">
        <button className="policy-back-btn" onClick={() => navigate('/')}>← 돌아가기</button>
        <h1 className="policy-title">개인정보처리방침</h1>
      </div>
      <div className="policy-body">
        <p><strong>CREATURE WORLD</strong> (이하 "서비스")는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」을 준수합니다.</p>
        <p>본 방침은 <strong>2026년 6월 1일</strong>부터 적용됩니다.</p>

        <hr />

        <h2>1. 수집하는 개인정보 항목</h2>
        <p>서비스는 Google 로그인을 통해 아래 정보를 수집합니다.</p>
        <ul>
          <li>이메일 주소</li>
          <li>이름 (Google 계정 표시 이름)</li>
          <li>프로필 사진</li>
        </ul>
        <p>게임 이용 과정에서 아래 정보가 자동 생성됩니다.</p>
        <ul>
          <li>보유 카드 정보</li>
          <li>뽑기권 수량</li>
          <li>접속 일시 및 이용 기록</li>
        </ul>

        <hr />

        <h2>2. 개인정보의 수집 및 이용 목적</h2>
        <p>수집된 개인정보는 다음 목적으로만 사용됩니다.</p>
        <ul>
          <li>회원 식별 및 서비스 제공</li>
          <li>게임 데이터 저장 및 동기화</li>
          <li>게시판 및 거래소 서비스 운영</li>
          <li>부정 이용 방지</li>
        </ul>

        <hr />

        <h2>3. 개인정보의 보유 및 이용 기간</h2>
        <ul>
          <li>회원 탈퇴 시 즉시 삭제</li>
          <li>단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관</li>
        </ul>

        <hr />

        <h2>4. 개인정보의 제3자 제공</h2>
        <p>서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.<br />단, 아래의 경우는 예외입니다.</p>
        <ul>
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
        </ul>

        <hr />

        <h2>5. 개인정보 처리 위탁</h2>
        <p>서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다.</p>
        <table className="policy-table">
          <thead>
            <tr>
              <th>수탁 업체</th>
              <th>위탁 업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Google Firebase (Google LLC)</td>
              <td>데이터 저장 및 인증 서비스</td>
            </tr>
          </tbody>
        </table>

        <hr />

        <h2>6. 이용자의 권리</h2>
        <p>이용자는 언제든지 아래 권리를 행사할 수 있습니다.</p>
        <ul>
          <li>개인정보 열람 요청</li>
          <li>개인정보 수정 요청</li>
          <li>개인정보 삭제 요청 (회원 탈퇴)</li>
          <li>개인정보 처리 정지 요청</li>
        </ul>
        <p>요청은 아래 연락처로 문의해 주세요.</p>

        <hr />

        <h2>7. 개인정보 보호책임자</h2>
        <ul>
          <li>성명: 이주형</li>
          <li>이메일: leedoh9@naver.com</li>
        </ul>

        <hr />

        <h2>8. 쿠키 및 자동 수집 항목</h2>
        <p>서비스는 로그인 상태 유지를 위해 브라우저의 로컬 스토리지를 사용합니다.<br />브라우저 설정에서 저장 데이터를 삭제할 수 있습니다.</p>

        <hr />

        <h2>9. 개인정보처리방침 변경</h2>
        <p>본 방침은 법령 및 서비스 변경에 따라 개정될 수 있으며, 변경 시 서비스 내 공지사항을 통해 안내합니다.</p>

        <hr />

        <p><em>본 방침은 2026년 6월 1일부터 시행됩니다.</em></p>
      </div>
      <div className="policy-footer-nav">
        <button className="policy-back-btn" onClick={() => navigate('/')}>← 게임으로 돌아가기</button>
      </div>
    </div>
  );
}
