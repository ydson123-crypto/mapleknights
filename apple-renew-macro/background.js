// -*- coding: utf-8 -*-

let isRunning = false;
let shouldStop = false;
let logEntries = [];
let activeRunId = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startMacro') {
    if (isRunning) {
      sendResponse({success: false, error: '이미 매크로가 실행 중입니다.'});
      return;
    }

    const count = Number(request.count);
    const delay = Number(request.delay);
    if (!Number.isInteger(count) || count < 0 || count > 10000) {
      sendResponse({success: false, error: '반복 횟수는 0~10,000 사이의 정수여야 합니다.'});
      return;
    }
    if (!Number.isFinite(delay) || delay < 0.5 || delay > 30) {
      sendResponse({success: false, error: '딜레이는 0.5~30초 사이여야 합니다.'});
      return;
    }

    const runId = ++activeRunId;
    isRunning = true;
    shouldStop = false;
    startMacroBackground(count, delay, runId);
    sendResponse({success: true});
  } else if (request.action === 'stopMacro') {
    shouldStop = true;
    sendResponse({success: true});
  } else if (request.action === 'getStatus') {
    sendResponse({isRunning});
  }
});

async function startMacroBackground(count, delaySeconds, runId) {
  logEntries = [];
  const delay = delaySeconds * 1000;
  const isInfinite = count === 0;
  const totalLabel = isInfinite ? '∞' : count;
  const actionTimeout = 15000;

  addLog('========== 시작 ==========', 'info');
  addLog(`반복 횟수: ${isInfinite ? '무한(중지 시까지)' : count}, 반복 간 대기: ${delaySeconds}초`, 'info');
  notifyPopup(`⏳ 반복 1/${totalLabel} 진행 중...`, 'running', true);

  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) {
      throw new Error('현재 탭을 찾을 수 없습니다.');
    }

    if (!isApplePage(tab.url)) {
      throw new Error('Apple 구독 관리 페이지를 연 뒤 다시 실행하세요.');
    }

    let completedCount = 0;

    mainLoop: while (isInfinite || completedCount < count) {
      if (isStopped(runId)) break;
      const currentNumber = completedCount + 1;

      addLog(`[${currentNumber}/${totalLabel}] 반복 시작...`, 'info');
      notifyPopup(`⏳ 반복 ${currentNumber}/${totalLabel} 진행 중...`, 'running', true);

      try {
        addLog('  └─ Step 1: YouTube 구독 항목 대기 중 (최대 15초)...', 'info');
        const youtubeResult = await waitForTabAction(tab.id, 'clickYoutube', runId, actionTimeout);
        if (!youtubeResult) break mainLoop;
        addLog(youtubeResult.skipped
          ? '  └─ Step 1: YouTube 상세 화면이 이미 열려 있어 클릭 생략'
          : '  └─ Step 1: YouTube 구독 항목 클릭 완료', 'success');

        addLog('  └─ Step 2: YouTube Renew 버튼 대기 중 (최대 15초)...', 'info');
        if (!(await waitForTabAction(tab.id, 'clickRenew', runId, actionTimeout))) break mainLoop;
        addLog('  └─ Step 2: Renew 버튼 클릭 완료', 'success');

        addLog('  └─ Step 3: Confirm 버튼 대기 중 (최대 15초)...', 'info');
        if (!(await waitForTabAction(tab.id, 'clickConfirm', runId, actionTimeout))) break mainLoop;
        addLog('  └─ Step 3: Confirm 버튼 클릭 완료', 'success');

        addLog('  └─ Step 4: 결제 오류와 Cancel 버튼 대기 중 (최대 15초)...', 'info');
        if (!(await waitForTabAction(tab.id, 'checkError', runId, actionTimeout))) break mainLoop;
        addLog('  └─ ⚠️ 결제 오류 감지 → Cancel 클릭 완료', 'warning');

        completedCount++;
        addLog(`[${currentNumber}/${totalLabel}] 완료✓`, 'success');

        if ((isInfinite || completedCount < count) && !(await waitWithStop(delay, runId))) {
          break mainLoop;
        }
      } catch (error) {
        if (isStopped(runId)) break;
        if (error.code !== 'ACTION_TIMEOUT') throw error;

        addLog(`  └─ ⚠️ ${error.message}`, 'warning');
        addLog('  └─ 페이지 전체 새로고침 후 같은 반복을 다시 시작합니다.', 'warning');
        notifyPopup(`🔄 ${currentNumber}/${totalLabel} 화면 복구 중...`, 'running', true);

        if (!(await reloadTabAndWait(tab.id, runId))) break;
        addLog('  └─ 페이지 새로고침 완료', 'success');
      }
    }

    if (!isStopped(runId)) {
      addLog('========== 완료 ==========', 'success');
      addLog(`총 ${count}회 반복 완료`, 'success');
      notifyPopup(`✅ 완료! ${count}회 반복 실행됨`, 'success', false);
    } else {
      addLog('========== 사용자 중지 ==========', 'warning');
      notifyPopup('🛑 사용자가 중지했습니다', 'error', false);
    }
  } catch (error) {
    addLog(`❌ 오류: ${error.message}`, 'error');
    notifyPopup(`❌ 오류: ${error.message}`, 'error', false);
  } finally {
    if (runId === activeRunId) {
      isRunning = false;
      shouldStop = false;
    }
    saveLogs();
  }
}

function isApplePage(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'apple.com' || hostname.endsWith('.apple.com');
  } catch {
    return false;
  }
}

function isStopped(runId) {
  return shouldStop || runId !== activeRunId;
}

async function waitWithStop(ms, runId) {
  const endAt = Date.now() + ms;
  let nextKeepAliveAt = Date.now() + 20000;
  while (Date.now() < endAt) {
    if (isStopped(runId)) return false;
    if (Date.now() >= nextKeepAliveAt) {
      await chrome.runtime.getPlatformInfo();
      nextKeepAliveAt = Date.now() + 20000;
    }
    await sleep(Math.min(250, endAt - Date.now()));
  }
  return !isStopped(runId);
}

async function waitForTabAction(tabId, action, runId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastDetails = '접근 가능한 프레임 없음';

  while (Date.now() < deadline) {
    if (isStopped(runId)) return false;

    const attempt = await tryExecuteTabAction(tabId, action);
    if (attempt.found) return attempt.result || {};
    lastDetails = attempt.details || lastDetails;

    const remaining = deadline - Date.now();
    if (remaining > 0 && !(await waitWithStop(Math.min(250, remaining), runId))) {
      return false;
    }
  }

  const actionName = {
    clickYoutube: 'YouTube 구독 항목',
    clickRenew: 'YouTube Renew 버튼',
    clickConfirm: 'Confirm 버튼',
    checkError: '결제 오류와 Cancel 버튼'
  }[action] || action;
  const error = new Error(`${actionName}을(를) 15초 동안 찾지 못했습니다. 탐색 결과: ${lastDetails}`);
  error.code = 'ACTION_TIMEOUT';
  throw error;
}

async function tryExecuteTabAction(tabId, action) {
  let inspections;

  try {
    inspections = await chrome.scripting.executeScript({
      target: {tabId, allFrames: true},
      func: performPageAction,
      args: [action, false]
    });
  } catch (error) {
    throw new Error(`Apple 페이지에 접근할 수 없습니다: ${error.message}`);
  }

  if (action === 'checkError') {
    const errorFrame = inspections.find(({result}) => result?.hasError);
    if (!errorFrame) {
      return {found: false, details: formatFrameDetails(inspections)};
    }

    if (!errorFrame.result.canClick) {
      return {found: false, details: formatFrameDetails(inspections)};
    }

    const [clickResult] = await chrome.scripting.executeScript({
      target: {tabId, frameIds: [errorFrame.frameId]},
      func: performPageAction,
      args: [action, true]
    });

    if (!clickResult?.result?.success) {
      return {found: false, details: formatFrameDetails(inspections)};
    }
    return {found: true, details: formatFrameDetails(inspections)};
  }

  const targetFrame = inspections.find(({result}) => result?.found);
  if (!targetFrame) {
    return {found: false, details: formatFrameDetails(inspections)};
  }

  const [clickResult] = await chrome.scripting.executeScript({
    target: {tabId, frameIds: [targetFrame.frameId]},
    func: performPageAction,
    args: [action, true]
  });

  if (!clickResult?.result?.success) {
    return {found: false, details: formatFrameDetails(inspections)};
  }
  return {found: true, result: clickResult.result, details: formatFrameDetails(inspections)};
}

function formatFrameDetails(inspections) {
  return inspections
    .map(({result}) => result)
    .filter(Boolean)
    .map(result => `${result.frame || 'unknown'} [${(result.buttons || []).join(', ') || '버튼 없음'}]`)
    .join(' / ') || '접근 가능한 프레임 없음';
}

async function reloadTabAndWait(tabId, runId) {
  await chrome.tabs.reload(tabId, {bypassCache: true});
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (isStopped(runId)) return false;
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') {
      return waitWithStop(1000, runId);
    }
    if (!(await waitWithStop(250, runId))) return false;
  }

  throw new Error('페이지를 새로고침했지만 30초 안에 로딩이 완료되지 않았습니다.');
}

// 이 함수는 Apple 페이지 안에서 실행되므로 외부 변수에 의존하지 않아야 한다.
function performPageAction(action, shouldClick) {
  const normalize = value => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isVisible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 && rect.height > 0;
  };

  const roots = [];
  const collectRoots = root => {
    roots.push(root);
    root.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) collectRoots(element.shadowRoot);
    });
  };
  collectRoots(document);

  const queryAll = selector => roots.flatMap(root => Array.from(root.querySelectorAll(selector)));
  const buttonText = button => normalize(button.textContent || button.getAttribute('aria-label'));
  const usableButton = button => isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
  const visibleButtonTexts = () => Array.from(new Set(
    queryAll('button, [role="button"]')
      .filter(usableButton)
      .map(buttonText)
      .filter(Boolean)
  )).slice(0, 15);
  const diagnostic = () => ({frame: location.hostname, buttons: visibleButtonTexts()});

  const findButton = (selectors, textCandidates, scope = null) => {
    const scopeRoots = scope ? [scope] : roots;
    for (const root of scopeRoots) {
      for (const selector of selectors) {
        const button = root.querySelector(selector);
        if (usableButton(button)) return button;
      }
    }

    const candidates = scope
      ? Array.from(scope.querySelectorAll('button, [role="button"]'))
      : queryAll('button, [role="button"]');
    return candidates.find(button => {
      const text = buttonText(button);
      return usableButton(button) && textCandidates.some(candidate => text === candidate || text.includes(candidate));
    }) || null;
  };

  const click = button => {
    if (!shouldClick) return true;
    button.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
    button.focus({preventScroll: true});
    button.click();
    return true;
  };

  const renewSelectors = [
    'button[data-test="action-cta"]',
    '[data-test="action-cta"] button',
    'button[data-testid="action-cta"]',
    'button[name="renew"]',
    'button[aria-label*="Renew" i]',
    'button[aria-label*="Resubscribe" i]',
    'button[data-test*="renew" i]',
    'button[data-test*="resubscribe" i]',
    'button[data-testid*="renew" i]',
    'button[data-testid*="resubscribe" i]'
  ];
  const renewTexts = [
    'renew',
    'renew subscription',
    'resubscribe',
    'subscribe again',
    '갱신',
    '연장',
    '구독 갱신',
    '구독 연장',
    '다시 구독',
    '재구독'
  ];

  const findYoutubeLabels = () => queryAll('h1, h2, h3, h4, p, span, [role="heading"]')
    .filter(element => isVisible(element) && normalize(element.textContent).includes('youtube'))
    .sort((a, b) => normalize(a.textContent).length - normalize(b.textContent).length);

  const findRenewButton = () => {
    for (const label of findYoutubeLabels()) {
      let container = label;
      for (let depth = 0; container && depth < 8; depth++, container = container.parentElement) {
        const button = findButton(renewSelectors, renewTexts, container);
        if (button) return button;
      }
    }
    return findButton(renewSelectors, renewTexts);
  };

  if (action === 'clickYoutube') {
    // 이전 반복에서 상세 화면이 그대로 열려 있으면 Renew 버튼이 이미 보이므로 클릭하지 않는다.
    if (findRenewButton()) return {found: true, success: true, skipped: true, ...diagnostic()};

    const clickableSelector = 'a, button, [role="button"], [role="link"], [tabindex]';
    const label = findYoutubeLabels()[0];
    if (!label) return {found: false, success: false, ...diagnostic()};

    // 구독 카드(링크/버튼)를 우선 클릭하고, 없으면 cursor:pointer 인 상위 요소, 그것도 없으면 제목 자체를 클릭한다.
    let target = label.closest(clickableSelector);
    for (let element = label; !target && element && element !== document.body; element = element.parentElement) {
      if (getComputedStyle(element).cursor === 'pointer') target = element;
    }
    target ||= label;
    if (!isVisible(target)) return {found: false, success: false, ...diagnostic()};

    click(target);
    return {found: true, success: true, text: normalize(target.textContent).slice(0, 50), ...diagnostic()};
  }

  if (action === 'clickRenew') {
    const button = findRenewButton();
    if (!button) return {found: false, success: false, ...diagnostic()};
    click(button);
    return {found: true, success: true, text: buttonText(button), ...diagnostic()};
  }

  if (action === 'clickConfirm') {
    const button = findButton([
      'button[data-test="button-confirm"]',
      '[data-test="button-confirm"] button',
      'button[data-test="confirm-button"]',
      'button[aria-label*="Confirm" i]'
    ], ['confirm', '확인']);
    if (!button) return {found: false, success: false, ...diagnostic()};
    click(button);
    return {found: true, success: true, text: buttonText(button), ...diagnostic()};
  }

  if (action === 'checkError') {
    const errorPhrases = ['unable to complete purchase', 'unable to charge', '구매를 완료할 수 없', '결제할 수 없'];
    const dialogCandidates = queryAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-test*="modal" i]');
    let errorContainer = dialogCandidates.find(element => {
      const text = normalize(element.textContent);
      return isVisible(element) && errorPhrases.some(phrase => text.includes(phrase));
    });

    if (!errorContainer) {
      const textElement = queryAll('h1, h2, h3, p, span, div').find(element => {
        const text = normalize(element.textContent);
        return isVisible(element) && text.length < 1000 && errorPhrases.some(phrase => text.includes(phrase));
      });
      errorContainer = textElement?.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') || textElement;
    }

    if (!errorContainer) {
      return {found: true, success: true, hasError: false, canClick: false};
    }

    const cancelButton = findButton([
      'button[data-test="Cancel-button"]',
      'button[data-test="button-cancel"]',
      '[data-test="Cancel-button"] button',
      'button[aria-label*="Cancel" i]'
    ], ['cancel', '취소'], errorContainer) || findButton([
      'button[data-test="Cancel-button"]',
      'button[data-test="button-cancel"]'
    ], ['cancel', '취소']);

    if (!cancelButton) {
      return {
        found: true,
        success: false,
        hasError: true,
        canClick: false,
        error: '결제 오류는 발견했지만 Cancel 버튼을 찾을 수 없습니다.'
      };
    }

    click(cancelButton);
    return {found: true, success: true, hasError: true, canClick: true, text: buttonText(cancelButton)};
  }

  return {found: false, success: false, error: `지원하지 않는 동작: ${action}`};
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addLog(message, type = 'info') {
  const entry = {
    time: new Date().toLocaleTimeString('ko-KR'),
    message,
    type,
    timestamp: Date.now()
  };

  const consoleMethod = type === 'error'
    ? console.error
    : type === 'warning'
      ? console.warn
      : console.log;
  consoleMethod.call(console, `[Apple Renew][${entry.time}][${type}] ${message}`);

  logEntries.push(entry);
  saveLogs();

  chrome.runtime.sendMessage({action: 'updateLog', message, type}).catch(() => {});
}

function notifyPopup(status, type, running) {
  chrome.runtime.sendMessage({action: 'updateStatus', status, type, isRunning: running}).catch(() => {});
}

function saveLogs() {
  chrome.storage.local.set({macroLogs: logEntries});
}
