// constants/fonts.js

/**
 * Available fonts for text elements
 * Includes system fonts, custom TTF fonts, and Google Fonts
 */
export const FONT_LIST = [
    // 기본 시스템 폰트
    { value: 'Arial', name: 'Arial' },
    { value: 'Helvetica', name: 'Helvetica' },
    { value: 'Times New Roman', name: 'Times New Roman' },
    { value: 'Georgia', name: 'Georgia' },
    { value: 'Verdana', name: 'Verdana' },
    { value: 'Courier New', name: 'Courier New' },
    { value: 'Impact', name: 'Impact' },
    { value: 'Comic Sans MS', name: 'Comic Sans MS' },
    { value: 'Trebuchet MS', name: 'Trebuchet MS' },

    // 한글 시스템 폰트
    { value: 'Noto Sans KR', name: 'Noto Sans 한글' },
    { value: 'Malgun Gothic', name: '맑은 고딕' },
    { value: 'Nanum Gothic', name: '나눔고딕' },

    // 커스텀 TTF 폰트 (assets/fonts/에 TTF 파일 필요)
    { value: 'Galmuri11', name: '갈무리11 (픽셀)' },
    { value: 'NanumGothic Custom', name: '나눔고딕 (TTF)' },
    { value: 'Pretendard', name: 'Pretendard' },
    { value: 'Gmarket Sans', name: 'G마켓 산스' },
    { value: 'Cafe24 Ssurround', name: 'Cafe24 써라운드' },
    { value: 'Cafe24 Oneprettynight', name: 'Cafe24 원쁘띠나잇' },
    { value: 'Binggrae', name: '빙그레체' },
    { value: 'Jua', name: '주아' },

    // Google Fonts (웹 폰트)
    { value: 'Roboto', name: 'Roboto' },
    { value: 'Inter', name: 'Inter' },
    { value: 'Poppins', name: 'Poppins' },
    { value: 'Playfair Display', name: 'Playfair Display' },
    { value: 'Dancing Script', name: 'Dancing Script' },
    { value: 'Pacifico', name: 'Pacifico' },
    { value: 'Lobster', name: 'Lobster' }
];
