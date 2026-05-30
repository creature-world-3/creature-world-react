import { useNavigate } from 'react-router-dom';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="policy-wrap">
      <div className="policy-header">
        <button className="policy-back-btn" onClick={() => navigate('/')}>← 돌아가기</button>
        <h1 className="policy-title">이용약관</h1>
      </div>
      <div className="policy-body">
        <p><strong>CREATURE WORLD</strong> 서비스(이하 "서비스")를 이용해 주셔서 감사합니다.<br />본 약관은 서비스 이용에 관한 조건 및 절차를 규정합니다.</p>
        <p>본 약관은 <strong>2026년 6월 1일</strong>부터 적용됩니다.</p>

        <hr />

        <h2>제1조 (목적)</h2>
        <p>본 약관은 이주형(이하 "운영자")이 제공하는 CREATURE WORLD 서비스의 이용 조건 및 절차, 운영자와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.</p>

        <hr />

        <h2>제2조 (서비스 이용)</h2>
        <p>① 서비스는 Google 계정으로 로그인하여 이용할 수 있습니다.<br />
        ② 만 14세 미만의 이용자는 서비스를 이용할 수 없습니다.<br />
        ③ 이용자는 타인의 계정을 사용하거나 도용해서는 안 됩니다.</p>

        <hr />

        <h2>제3조 (금지 행위)</h2>
        <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
        <ul>
          <li>서비스의 정상적인 운영을 방해하는 행위</li>
          <li>비정상적인 방법으로 게임 재화(뽑기권 등)를 획득하는 행위</li>
          <li>타인에게 불쾌감을 주는 내용을 게시판에 게시하는 행위</li>
          <li>서비스를 상업적 목적으로 무단 이용하는 행위</li>
          <li>관련 법령에 위반되는 행위</li>
        </ul>

        <hr />

        <h2>제4조 (서비스의 변경 및 중단)</h2>
        <p>① 운영자는 서비스의 내용을 변경하거나 중단할 수 있습니다.<br />
        ② 서비스 중단 시 사전에 공지하며, 불가피한 경우 사후 공지할 수 있습니다.</p>

        <hr />

        <h2>제5조 (게임 재화)</h2>
        <p>① 서비스 내 뽑기권 등 게임 재화는 현금으로 환전하거나 양도할 수 없습니다.<br />
        ② 운영자의 귀책 사유 없이 이용자의 실수로 재화가 소멸된 경우 복구하지 않습니다.<br />
        ③ 서비스 종료 시 게임 재화는 소멸됩니다.</p>

        <hr />

        <h2>제6조 (면책 조항)</h2>
        <p>① 운영자는 천재지변, 서비스 점검, 서버 장애 등으로 인한 서비스 중단에 대해 책임을 지지 않습니다.<br />
        ② 이용자가 게시한 내용으로 인해 발생하는 분쟁에 대해 운영자는 책임을 지지 않습니다.<br />
        ③ 이용자 간 거래소를 통한 거래에서 발생하는 분쟁은 당사자 간 해결을 원칙으로 합니다.</p>

        <hr />

        <h2>제7조 (분쟁 해결)</h2>
        <p>서비스 이용과 관련하여 분쟁이 발생한 경우 운영자와 이용자는 성실히 협의합니다.<br />
        협의가 이루어지지 않을 경우 관련 법령에 따릅니다.</p>

        <hr />

        <h2>제8조 (문의)</h2>
        <ul>
          <li>이메일: leedoh9@naver.com</li>
        </ul>

        <hr />

        <h2>제9조 (약관의 변경)</h2>
        <p>운영자는 약관을 변경할 수 있으며, 변경 시 서비스 내 공지사항을 통해 7일 전에 안내합니다.</p>

        <hr />

        <p><em>본 약관은 2026년 6월 1일부터 시행됩니다.</em></p>
      </div>
      <div className="policy-footer-nav">
        <button className="policy-back-btn" onClick={() => navigate('/')}>← 게임으로 돌아가기</button>
      </div>
    </div>
  );
}
