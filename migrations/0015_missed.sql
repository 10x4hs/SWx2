-- 못함 표시: 체크(끝냄)와 따로, 빨간 버튼으로 "못 했어요" 를 남겨요. 끝냄과 못함은 동시에 켜지지 않아요.
ALTER TABLE plans ADD COLUMN missed INTEGER NOT NULL DEFAULT 0;
