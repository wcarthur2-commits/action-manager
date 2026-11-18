export function coded(code, status = 0, detail = '') {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  err.detail = detail;
  return err;
}

export const ERROR_TEXT = {
  MISSING_PASSPHRASE: '未有同步密碼。請輸入密碼再同步。',
  MISSING_CONFIG: '請先填 GitHub 用戶名、私人倉庫名同 token。',
  BAD_NAME: '用戶名或倉庫名格式唔啱。',
  BAD_PATH: '檔案路徑唔正確。請用例如 board.json，唔好以 / 開頭，亦唔好包含 ..。',
  BAD_PASSPHRASE: '密碼唔啱，解唔到遠端資料。為安全起見，冇覆寫遠端檔案。',
  BAD_FILE: '遠端檔案唔係行動 Manager 嘅加密檔。為安全起見，冇覆寫。',
  UNAUTHORIZED: 'Token 無效或者已過期。請喺 GitHub 再產生一條，貼過嚟。',
  FORBIDDEN: 'Token 權限不足。請確認 fine-grained token 只開咗呢個私人倉庫嘅 Contents 讀寫。',
  NOT_FOUND: '搵唔到倉庫。請檢查用戶名同倉庫名，同埋 token 有冇權限。',
  CONFLICT: '遠端有衝突，重試幾次都未成功。請稍後再撳同步。',
  NETWORK: '上唔到網。本機資料仍然喺，稍後會再試。',
  RATE_LIMIT: 'GitHub 請求太密，請等一陣再同步。',
  PUBLIC_REPO: '呢個倉庫係公開嘅，已拒絕上傳。請改用一個私人倉庫，唔好用放網頁嗰個。',
  EMPTY_REPO: '倉庫未有 commit，建立第一個加密檔時失敗。請稍後再撳同步。',
  GITHUB: 'GitHub 回應錯誤。請稍後再試。',
  BAD_BACKUP: '呢個檔案唔係行動 Manager 嘅備份。',
  ENCRYPTED_BACKUP: '呢個係加密同步檔，唔係明文備份。請用設定入面嘅「匯出備份」。',
  IMPORT_EMPTY: '備份入面冇資料。',
};
