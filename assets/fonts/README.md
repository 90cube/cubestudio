# 커스텀 폰트 추가 가이드

이 폴더에 TTF/OTF 폰트 파일을 추가하여 텍스트 입력에서 사용할 수 있습니다.

## 📁 폴더 구조
```
assets/fonts/
├── README.md (이 파일)
├── NanumGothic.ttf (예시)
├── NanumGothic-Bold.ttf (예시)
├── Pretendard-Regular.ttf (예시)
└── [기타 TTF/OTF 파일들]
```

## 🔧 폰트 추가 방법

### 1단계: TTF/OTF 파일 추가
원하는 폰트 파일을 이 폴더 (`assets/fonts/`)에 복사합니다.

### 2단계: CSS에서 폰트 정의
`assets/css/style.css` 파일을 열고 해당하는 `@font-face` 규칙의 주석을 해제하거나 새로 추가합니다:

```css
@font-face {
    font-family: '폰트이름';
    src: url('../fonts/폰트파일.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
```

### 3단계: JavaScript에서 폰트 목록에 추가
`components/canvas/canvas.js` 파일에서 `fonts` 배열에 새 폰트를 추가합니다:

```javascript
{ value: '폰트이름', name: '표시될이름' },
```

## 📋 현재 설정된 폰트들

### 기본 포함 (파일 필요)
- **NanumGothic Custom**: NanumGothic.ttf, NanumGothic-Bold.ttf
- **Pretendard**: Pretendard-Regular.ttf, Pretendard-Bold.ttf
- **Gmarket Sans**: GmarketSansTTFMedium.ttf
- **Cafe24 Ssurround**: Cafe24Ssurround.ttf
- **Cafe24 Oneprettynight**: Cafe24Oneprettynight.ttf
- **Binggrae**: Binggrae.ttf
- **Jua**: Jua-Regular.ttf

## 📥 인기 한글 폰트 다운로드 링크

### 무료 한글 폰트
- **나눔고딕**: https://hangeul.naver.com/font
- **Pretendard**: https://cactus.tistory.com/306
- **G마켓 산스**: https://campaign.gmarket.co.kr/fonts/
- **Cafe24**: https://fonts.cafe24.com/
- **빙그레체**: https://www.binggrae.co.kr/brand/font.do
- **주아**: https://fonts.google.com/specimen/Jua

### 상업적 사용 가능한 폰트
- **눈누(noonnu)**: https://noonnu.cc/ (다양한 무료 한글 폰트)
- **배민 폰트**: https://www.woowahan.com/fonts
- **카카오 폰트**: https://brunch.co.kr/@kakao-it/102

## ⚠️ 주의사항

1. **라이선스 확인**: 폰트 사용 전 라이선스를 반드시 확인하세요
2. **파일명**: 공백이나 특수문자가 있는 파일명은 피하세요
3. **용량**: 너무 큰 폰트 파일은 로딩 속도에 영향을 줄 수 있습니다
4. **호환성**: 일부 폰트는 웹에서 제대로 표시되지 않을 수 있습니다

## 🎨 폰트 미리보기

텍스트 입력 창에서 폰트를 선택하면 실시간으로 미리볼 수 있습니다.

## 🔧 트러블슈팅

### Q: 폰트가 적용되지 않아요
A: 
1. TTF 파일이 assets/fonts/ 폴더에 있는지 확인
2. CSS의 @font-face 규칙이 올바른지 확인
3. 파일명과 font-family 이름이 일치하는지 확인
4. 브라우저 캐시를 새로고침 (Ctrl+F5)

### Q: 한글이 깨져서 나와요
A: 
1. TTF 파일이 한글을 지원하는지 확인
2. UTF-8 인코딩이 올바르게 설정되어 있는지 확인
3. 폰트 파일이 손상되지 않았는지 확인

## 📝 예시: 새 폰트 추가하기

1. `MyFont.ttf` 파일을 `assets/fonts/`에 복사
2. `assets/css/style.css`에 추가:
```css
@font-face {
    font-family: 'MyFont';
    src: url('../fonts/MyFont.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
```
3. `components/canvas/canvas.js`의 fonts 배열에 추가:
```javascript
{ value: 'MyFont', name: '내 폰트' },
```
4. 페이지 새로고침 후 텍스트 입력에서 확인