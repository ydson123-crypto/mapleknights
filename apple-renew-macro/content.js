// -*- coding: utf-8 -*-

console.log('🟢 Content.js 로드됨!');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 메시지 수신:', request.action);
  
  if (request.action === 'ping') {
    sendResponse({success: true, url: location.href});
  } else if (request.action === 'clickRenew') {
    const result = clickRenewButton();
    console.log('결과:', result);
    sendResponse({success: result});
  } else if (request.action === 'clickConfirm') {
    const result = clickConfirmButton();
    console.log('결과:', result);
    sendResponse({success: result});
  } else if (request.action === 'checkError') {
    const result = checkAndCancelError();
    console.log('결과:', result);
    sendResponse({success: result});
  }
});

function clickRenewButton() {
  console.log('=== Step 1️⃣ Renew 버튼 클릭 ===');
  
  const button = document.querySelector('button[data-test="action-cta"]');
  
  if (button && button.offsetHeight > 0) {
    console.log('✅ Renew 버튼 발견!');
    console.log('텍스트:', button.textContent.trim());
    button.click();
    console.log('✅ 클릭 완료!');
    return true;
  }
  
  console.error('❌ Renew 버튼을 찾을 수 없습니다');
  return false;
}

function clickConfirmButton() {
  console.log('=== Step 2️⃣ Confirm 버튼 클릭 ===');
  
  const button = document.querySelector('button[data-test="button-confirm"]');
  
  if (button && button.offsetHeight > 0) {
    console.log('✅ Confirm 버튼 발견!');
    console.log('텍스트:', button.textContent.trim());
    button.click();
    console.log('✅ 클릭 완료!');
    return true;
  }
  
  console.warn('⚠️ Confirm 버튼 미발견');
  return true;
}

function checkAndCancelError() {
  console.log('=== Step 3️⃣ 에러 체크 및 Cancel ===');
  
  // 에러 텍스트 찾기
  const errorText = Array.from(document.querySelectorAll('*')).find(el =>
    el.textContent.includes('Unable to Complete Purchase') ||
    el.textContent.includes('unable to charge')
  );
  
  if (errorText) {
    console.log('⚠️ 에러 팝업 발견!');
    
    // Cancel 버튼 - data-test 속성으로 찾기 (대문자 C 주의!)
    const cancelBtn = document.querySelector('button[data-test="Cancel-button"]');
    
    if (cancelBtn && cancelBtn.offsetHeight > 0) {
      console.log('✅ Cancel 버튼 발견!');
      console.log('텍스트:', cancelBtn.textContent.trim());
      cancelBtn.click();
      console.log('✅ Cancel 클릭 완료!');
      return true;
    } else {
      console.error('❌ Cancel 버튼을 찾을 수 없습니다');
    }
  }
  
  console.log('✅ 에러 없음 - 구독 성공 가능성');
  return false;
}
