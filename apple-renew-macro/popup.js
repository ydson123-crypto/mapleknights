// -*- coding: utf-8 -*-

let isRunning = false;
let logEntries = [];

document.getElementById('start').addEventListener('click', startMacro);
document.getElementById('stop').addEventListener('click', stopMacro);
document.getElementById('clearLog').addEventListener('click', clearLog);
document.getElementById('downloadLog').addEventListener('click', downloadLog);
document.getElementById('testContent').addEventListener('click', testContent);
document.getElementById('testDevTools').addEventListener('click', openDevTools);
document.getElementById('testLog').addEventListener('click', testLog);

document.addEventListener('DOMContentLoaded', () => {
  loadLogs();
  checkRunningStatus();
  addLogUI('📌 Popup 시작됨', 'info');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateLog') {
    addLogUI(request.message, request.type);
  } else if (request.action === 'updateStatus') {
    showStatus(request.status, request.type);
    isRunning = request.isRunning;
    updateButtonState();
  }
});

function checkRunningStatus() {
  chrome.runtime.sendMessage({action: 'getStatus'}, (response) => {
    if (response) {
      isRunning = response.isRunning;
      updateButtonState();
    }
  });
}

function updateButtonState() {
  document.getElementById('start').disabled = isRunning;
  document.getElementById('stop').disabled = !isRunning;
}

// ===== 디버그 함수 =====

async function testContent() {
  const debugDiv = document.getElementById('debugStatus');
  debugDiv.textContent = '⏳ 확인 중...';
  
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  
  try {
    chrome.tabs.sendMessage(tab.id, {action: 'ping'}, (response) => {
      if (chrome.runtime.lastError) {
        debugDiv.textContent = '❌ Content.js 로드 안 됨';
        addLogUI('❌ Content.js 로드 확인 실패', 'error');
      } else {
        debugDiv.textContent = '✅ Content.js 정상 작동!';
        addLogUI('✅ Content.js 정상 작동 확인됨', 'success');
      }
    });
  } catch (error) {
    debugDiv.textContent = `❌ 오류: ${error.message}`;
    addLogUI(`❌ 오류: ${error.message}`, 'error');
  }
}

function openDevTools() {
  chrome.runtime.sendMessage({action: 'openDevTools'}, () => {
    addLogUI('🔧 개발자도구를 열었습니다 (F12)', 'info');
    addLogUI('💡 콘솔(Console)에서 작동 상황을 확인할 수 있습니다', 'info');
  });
}

function testLog() {
  addLogUI('✅ 로그 테스트 메시지 1', 'success');
  addLogUI('⚠️ 로그 테스트 메시지 2', 'warning');
  addLogUI('❌ 로그 테스트 메시지 3', 'error');
  addLogUI('ℹ️ 로그 테스트 메시지 4', 'info');
}

// ===== 기존 함수들 =====

async function startMacro() {
  const count = parseInt(document.getElementById('count').value);
  const delay = parseFloat(document.getElementById('delay').value);
  
  if (!Number.isInteger(count) || count < 0 || count > 10000) {
    showStatus('❌ 반복 횟수를 0~10,000 사이로 입력하세요', 'error');
    addLogUI('❌ 오류: 잘못된 반복 횟수', 'error');
    return;
  }

  if (!Number.isFinite(delay) || delay < 0.5 || delay > 30) {
    showStatus('❌ 딜레이를 0.5~30초로 입력하세요', 'error');
    addLogUI('❌ 오류: 잘못된 딜레이', 'error');
    return;
  }
  
  chrome.runtime.sendMessage({
    action: 'startMacro',
    count: count,
    delay: delay
  }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      isRunning = false;
      updateButtonState();
      showStatus(`❌ ${response?.error || chrome.runtime.lastError?.message || '실행에 실패했습니다'}`, 'error');
    }
  });
  
  isRunning = true;
  updateButtonState();
}

function stopMacro() {
  chrome.runtime.sendMessage({action: 'stopMacro'});
  showStatus('⏳ 중지 중...', 'running');
  document.getElementById('stop').disabled = true;
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
}

function addLogUI(message, type = 'info') {
  const time = new Date().toLocaleTimeString('ko-KR');
  const consoleMethod = type === 'error'
    ? console.error
    : type === 'warning'
      ? console.warn
      : console.log;
  consoleMethod.call(console, `[Apple Renew Popup][${time}][${type}] ${message}`);

  const logElement = document.createElement('div');
  logElement.className = `log-entry log-${type}`;
  logElement.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
  document.getElementById('logBox').appendChild(logElement);
  document.getElementById('logBox').scrollTop = document.getElementById('logBox').scrollHeight;
}

function loadLogs() {
  chrome.storage.local.get(['macroLogs'], (result) => {
    if (result.macroLogs) {
      logEntries = result.macroLogs;
      const logBox = document.getElementById('logBox');
      logBox.innerHTML = '';
      logEntries.forEach(entry => {
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${entry.type}`;
        logElement.innerHTML = `<span class="log-time">[${entry.time}]</span> ${entry.message}`;
        logBox.appendChild(logElement);
      });
      logBox.scrollTop = logBox.scrollHeight;
    }
  });
}

function clearLog() {
  if (confirm('로그를 삭제하시겠습니까?')) {
    logEntries = [];
    document.getElementById('logBox').innerHTML = '';
    chrome.storage.local.set({macroLogs: []});
    addLogUI('로그가 초기화되었습니다', 'info');
  }
}

function downloadLog() {
  chrome.storage.local.get(['macroLogs'], (result) => {
    const logs = result.macroLogs || [];
    if (logs.length === 0) {
      alert('저장된 로그가 없습니다');
      return;
    }
    
    let csvContent = '시간,메시지,타입\n';
    logs.forEach(entry => {
      const message = entry.message.replace(/"/g, '""');
      csvContent += `"${entry.time}","${message}","${entry.type}"\n`;
    });
    
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const now = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `apple-renew-log-${now}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addLogUI(`📥 로그 다운로드: apple-renew-log-${now}.csv`, 'info');
  });
}
