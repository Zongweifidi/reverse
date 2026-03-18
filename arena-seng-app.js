(function() {
  'use strict';

  const LOCAL_STORAGE_KEY = 'cheng_bookings';
  const LOCAL_SETTINGS_KEY = 'cheng_booking_settings';
  const CLIENT_ID_KEY = 'cheng_booking_client_id';
  const LOCAL_ADMIN_PASSWORDS = ['878888'];
  const APP_CONFIG = {
    apiBaseUrl: '',
    pollIntervalMs: 15000
  };
  const FALLBACK_TIME_CONFIG = {
    timeGroups: [
      { label: '上午', times: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] },
      { label: '下午', times: ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30'] }
    ]
  };

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const bookingPage       = $('#booking-page');
  const adminPage         = $('#admin-page');
  const adminLogin        = $('#admin-login');
  const adminList         = $('#admin-list');
  const adminStats        = $('#admin-stats');
  const backBtn           = $('#back-btn');
  const footerYear        = $('#footer-year');
  const loginBtn          = $('#login-btn');
  const cancelLoginBtn    = $('#cancel-login-btn');
  const adminPassword     = $('#admin-password');
  const loginError        = $('#login-error');
  const bookingForm       = $('#booking-form');
  const bookingSubmitHint = $('#booking-submit-hint');
  const logoLink          = $('.nav__logo');
  const timePicker        = $('.time-picker');
  const formPanel         = $('.panel');
  const timeSlotsRoot     = $('#time-slots-root');
  const calPrev           = $('#cal-prev');
  const calNext           = $('#cal-next');
  const selectedDateLabel   = $('#selected-date-label');
  const selectedTimeLabel   = $('#selected-time-label');
  const availableCountLabel = $('#available-count-label');
  const timePickerHint      = $('#time-picker-hint');
  const heroNextDate        = $('#hero-next-date');
  const heroNextTime        = $('#hero-next-time');
  const heroNextStatus      = $('#hero-next-status');
  const stageLabel          = $('#booking-stage-label');
  const submitBtn           = $('#submit-btn');
  const formStatusNote      = $('#form-status-note');
  const reasonInput         = $('#booker-reason');
  const reasonCounter       = $('#reason-counter');
  const bookingCountBadge   = $('#booking-count-badge');
  const myBookingsHint      = $('#my-bookings-hint');
  const syncModePill        = $('#sync-mode-pill');
  const adminLoginHint      = $('#admin-login-hint');
  const adminPanelDesc      = $('#admin-panel-desc');
  const adminTimeSettings   = $('#admin-time-settings');
  const adminTimeStatus     = $('#admin-time-settings-status');
  const adminTimeSaveBtn    = $('#admin-time-save-btn');
  const adminTimeResetBtn   = $('#admin-time-reset-btn');
  const jumpLinks     = Array.from($$('.nav__link[href^="#"], .hero__actions .btn[href^="#"]'));
  const navLinks      = Array.from($$('.nav__link[href^="#"]'));
  const flowItems     = Array.from($$('[data-flow-step]'));

  const loginErrorDefaultText = loginError ? loginError.textContent.trim() : '密码错误。你不是成。';
  const AUTO_API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? '/api' : '';
  const API_BASE_URL = normalizeApiBaseUrl(APP_CONFIG.apiBaseUrl || AUTO_API_BASE_URL);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayString = toISODate(todayStart);

  const runtime = {
    remoteEnabled: Boolean(API_BASE_URL),
    clientId: getOrCreateClientId(),
    publicSyncPromise: null,
    adminSyncPromise: null,
    submitPending: false,
    settingsSavePending: false,
    timeConfig: normalizeTimeConfig(FALLBACK_TIME_CONFIG),
    disabledTimes: [],
    adminDisabledDraft: [],
    publicBookings: [],
    myBookings: Boolean(API_BASE_URL) ? [] : getLocalBookings(),
    adminBookings: [],
    adminPassword: '',
    syncError: '',
    lastSyncAt: '',
    pollTimer: null
  };

  if (!runtime.remoteEnabled) {
    runtime.disabledTimes = getLocalSettings().disabledTimes;
    runtime.adminDisabledDraft = runtime.disabledTimes.slice();
  }

  renderBookingTimeSlots();

  var selectedDate = findNextAvailableDate(90, getOccupancyBookings());
  var selectedDateObj = parseDate(selectedDate);
  var calYear = selectedDateObj.getFullYear();
  var calMonth = selectedDateObj.getMonth();
  var selectedTime = null;
  var logoClicks = 0;
  var logoTimer = null;

  function normalizeApiBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function toISODate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function parseDate(dateStr) {
    var parts = String(dateStr || '').split('-');
    if (parts.length !== 3) return new Date(todayStart);
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function getTimeValue(timeStr) {
    var parts = String(timeStr || '').split(':');
    return parseInt(parts[0] || '0', 10) * 60 + parseInt(parts[1] || '0', 10);
  }

  function getBookingDateTimeValue(booking) {
    if (booking && booking.date && booking.time) {
      var appointment = new Date(booking.date + 'T' + booking.time + ':00');
      if (!Number.isNaN(appointment.getTime())) return appointment.getTime();
    }

    var created = new Date(booking && booking.createdAt ? booking.createdAt : 0);
    return Number.isNaN(created.getTime()) ? 0 : created.getTime();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function cloneTimeConfig(config) {
    return {
      timeGroups: (config.timeGroups || []).map(function(group) {
        return {
          label: String(group.label || '').trim() || '时段',
          times: (group.times || []).map(function(time) {
            return String(time || '').trim();
          })
        };
      })
    };
  }

  function normalizeTimeConfig(raw) {
    var groups = Array.isArray(raw && raw.timeGroups) ? raw.timeGroups : FALLBACK_TIME_CONFIG.timeGroups;
    var normalizedGroups = groups.map(function(group) {
      return {
        label: String(group && group.label ? group.label : '').trim() || '时段',
        times: Array.isArray(group && group.times)
          ? group.times
              .map(function(time) { return String(time || '').trim(); })
              .filter(function(time, index, list) {
                return /^\d{2}:\d{2}$/.test(time) && list.indexOf(time) === index;
              })
          : []
      };
    }).filter(function(group) {
      return group.times.length > 0;
    });

    return cloneTimeConfig({
      timeGroups: normalizedGroups.length > 0 ? normalizedGroups : FALLBACK_TIME_CONFIG.timeGroups
    });
  }

  function getAllConfiguredTimes() {
    return runtime.timeConfig.timeGroups.reduce(function(result, group) {
      group.times.forEach(function(time) {
        if (result.indexOf(time) === -1) result.push(time);
      });
      return result;
    }, []);
  }

  function normalizeDisabledTimes(values) {
    var allowedTimes = getAllConfiguredTimes();
    if (!Array.isArray(values)) return [];

    return values
      .map(function(time) { return String(time || '').trim(); })
      .filter(function(time, index, list) {
        return allowedTimes.indexOf(time) !== -1 && list.indexOf(time) === index;
      });
  }

  function normalizeBooking(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var created = new Date(raw.createdAt || Date.now());
    var normalizedCreatedAt = Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString();
    var status = raw.status === 'accepted' || raw.status === 'rejected' ? raw.status : 'pending';
    var fallbackId = 'booking-' + String(raw.id || raw.date || '') + '-' + String(raw.time || '');

    return {
      id: String(raw.id || fallbackId),
      clientId: String(raw.clientId || '').trim(),
      reason: String(raw.reason || '').trim(),
      date: String(raw.date || ''),
      time: String(raw.time || ''),
      status: status,
      rejectReason: String(raw.rejectReason || '').trim(),
      createdAt: normalizedCreatedAt
    };
  }

  function getLocalBookings() {
    try {
      var parsed = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(normalizeBooking).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function setLocalBookings(data) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.map(normalizeBooking).filter(Boolean)));
  }

  function getLocalSettings() {
    try {
      var parsed = JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY) || '{}');
      return {
        disabledTimes: normalizeDisabledTimes(parsed.disabledTimes)
      };
    } catch (error) {
      return { disabledTimes: [] };
    }
  }

  function setLocalSettings(settings) {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({
      disabledTimes: normalizeDisabledTimes(settings.disabledTimes)
    }));
  }

  function getOrCreateClientId() {
    try {
      var existing = String(localStorage.getItem(CLIENT_ID_KEY) || '').trim();
      if (existing) return existing;
      var next = 'client-' + generateId();
      localStorage.setItem(CLIENT_ID_KEY, next);
      return next;
    } catch (error) {
      return 'client-' + generateId();
    }
  }

  function getOccupancyBookings() {
    return runtime.remoteEnabled ? runtime.publicBookings : getLocalBookings();
  }

  function getMyBookings() {
    return runtime.remoteEnabled ? runtime.myBookings : getLocalBookings();
  }

  function getAdminBookings() {
    return runtime.remoteEnabled ? runtime.adminBookings : getLocalBookings();
  }

  function getBookingSlots() {
    return Array.from($$('#time-slots-root .time-slot[data-role="booking-slot"]'));
  }

  function getBlockedTimeSet() {
    return new Set(runtime.disabledTimes);
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg, duration) {
    duration = duration || 2800;
    var old = document.querySelector('.toast');
    if (old) old.remove();

    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = msg;
    document.body.appendChild(el);

    setTimeout(function() {
      el.style.transition = 'opacity 300ms ease, transform 300ms ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(function() { el.remove(); }, 300);
    }, duration);
  }

  function renderBookingTimeSlots() {
    if (!timeSlotsRoot) return;

    var html = runtime.timeConfig.timeGroups.map(function(group) {
      var groupHtml = '<p class="time-picker__period">' + escapeHTML(group.label) + '</p>';
      groupHtml += '<div class="time-slots">';
      group.times.forEach(function(time) {
        groupHtml += '<button class="time-slot" type="button" data-role="booking-slot" data-time="' + escapeHTML(time) + '">' + escapeHTML(time) + '</button>';
      });
      groupHtml += '</div>';
      return groupHtml;
    }).join('');

    timeSlotsRoot.innerHTML = html;

    getBookingSlots().forEach(function(slot) {
      slot.addEventListener('click', function() {
        if (slot.disabled) return;
        selectedTime = slot.dataset.time;
        refreshTimeSlots(getOccupancyBookings());
        if (window.innerWidth <= 768 && formPanel && !reasonInput.value.trim()) {
          setTimeout(function() {
            formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 120);
        }
      });
    });
  }

  function renderAdminTimeSettings() {
    if (!adminTimeSettings) return;

    var blockedTimes = new Set(runtime.adminDisabledDraft);
    var html = runtime.timeConfig.timeGroups.map(function(group) {
      var groupHtml = '<div class="admin-settings__group">';
      groupHtml += '<div class="admin-settings__group-title">' + escapeHTML(group.label) + '</div>';
      groupHtml += '<div class="time-slots">';
      group.times.forEach(function(time) {
        var blocked = blockedTimes.has(time);
        groupHtml += '<button class="time-slot admin-time-toggle' + (blocked ? ' admin-time-toggle--blocked' : '') + '" type="button" data-admin-time="' + escapeHTML(time) + '" aria-pressed="' + (blocked ? 'true' : 'false') + '">' + escapeHTML(time) + '</button>';
      });
      groupHtml += '</div></div>';
      return groupHtml;
    }).join('');

    adminTimeSettings.innerHTML = html;

    adminTimeSettings.querySelectorAll('[data-admin-time]').forEach(function(button) {
      button.addEventListener('click', function() {
        var time = button.dataset.adminTime;
        if (!time) return;

        if (runtime.adminDisabledDraft.indexOf(time) === -1) runtime.adminDisabledDraft.push(time);
        else runtime.adminDisabledDraft = runtime.adminDisabledDraft.filter(function(item) { return item !== time; });

        runtime.adminDisabledDraft = normalizeDisabledTimes(runtime.adminDisabledDraft);
        renderAdminTimeSettings();
      });
    });

    if (adminTimeStatus) {
      if (runtime.settingsSavePending) adminTimeStatus.textContent = '正在保存时段设置，请稍候。';
      else if (runtime.adminDisabledDraft.length === 0) adminTimeStatus.textContent = '当前所有配置时段都开放预约。';
      else adminTimeStatus.textContent = '当前已关闭 ' + runtime.adminDisabledDraft.length + ' 个时段：' + runtime.adminDisabledDraft.join('、');
    }
  }

  function setActiveNav(hash) {
    navLinks.forEach(function(link) {
      link.classList.toggle('nav__link--active', link.getAttribute('href') === hash);
    });
  }

  function switchPage(page, shouldScroll) {
    shouldScroll = shouldScroll !== false;
    [bookingPage, adminPage, adminLogin].forEach(function(panel) {
      panel.classList.add('hidden');
    });

    var target = page === 'admin' ? adminPage : page === 'login' ? adminLogin : bookingPage;
    target.classList.remove('hidden');

    var anim = target.querySelector('.fade-in');
    if (anim) {
      anim.style.animation = 'none';
      void anim.offsetWidth;
      anim.style.animation = '';
    }

    if (shouldScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    var parts = dateStr.split('-');
    if (parts.length === 3) return parts[0] + ' 年 ' + parseInt(parts[1], 10) + ' 月 ' + parseInt(parts[2], 10) + ' 日';
    return dateStr;
  }

  function formatSubmittedAt(isoString) {
    var date = new Date(isoString || '');
    if (Number.isNaN(date.getTime())) return '—';
    return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function updateConnectionUI() {
    var syncing = Boolean(runtime.publicSyncPromise || runtime.adminSyncPromise);

    if (syncModePill) {
      if (!runtime.remoteEnabled) syncModePill.textContent = '本地预览模式';
      else if (runtime.syncError) syncModePill.textContent = '在线连接异常';
      else if (syncing) syncModePill.textContent = '在线同步中';
      else syncModePill.textContent = '共享在线模式';
    }

    if (bookingSubmitHint) {
      if (runtime.remoteEnabled) {
        bookingSubmitHint.textContent = runtime.syncError
          ? '当前在线后台连接异常，提交可能失败，请稍后重试。'
          : '提交后会同步到在线后台，并只在当前设备的「我的预约」里显示你的记录。';
      } else {
        bookingSubmitHint.textContent = '提交后可在「我的预约」中查看处理状态';
      }
    }

    if (myBookingsHint) {
      if (runtime.remoteEnabled) {
        myBookingsHint.textContent = runtime.syncError
          ? '当前正在尝试连接在线后台：' + runtime.syncError + '。'
          : '这里只显示这台设备提交的预约记录，审核状态会自动从在线后台同步。';
      } else {
        myBookingsHint.textContent = '这里展示当前浏览器保存的预约记录，状态变化会自动刷新。';
      }
    }

    if (adminLoginHint) {
      adminLoginHint.textContent = runtime.remoteEnabled
        ? '连续点击顶部 Reserve 5 次后即可输入密码进入，所有审核会直接写入在线后台'
        : '连续点击顶部 Reserve 5 次后即可输入密码进入';
    }

    if (adminPanelDesc) {
      adminPanelDesc.textContent = runtime.remoteEnabled
        ? '审核预约请求，并直接决定哪些时段暂时不开放。'
        : '审核所有预约请求，同意或拒绝并注明理由。';
    }
  }

  function isSlotTaken(bookings, dateStr, timeStr) {
    return bookings.some(function(booking) {
      return booking.date === dateStr && booking.time === timeStr && booking.status !== 'rejected';
    });
  }

  function isPastTimeSlot(dateStr, timeStr) {
    if (dateStr !== todayString) return false;
    var now = new Date();
    return getTimeValue(timeStr) <= now.getHours() * 60 + now.getMinutes();
  }

  function getDateAvailability(dateStr, bookings) {
    var blockedTimes = getBlockedTimeSet();
    var occupiedCount = 0;
    var availableCount = 0;

    getBookingSlots().forEach(function(slot) {
      var time = slot.dataset.time;
      if (blockedTimes.has(time)) return;
      if (isPastTimeSlot(dateStr, time)) return;
      if (isSlotTaken(bookings, dateStr, time)) {
        occupiedCount++;
        return;
      }
      availableCount++;
    });

    return {
      availableCount: availableCount,
      occupiedCount: occupiedCount
    };
  }

  function getFirstAvailableTime(dateStr, bookings) {
    var blockedTimes = getBlockedTimeSet();
    var slots = getBookingSlots();

    for (var i = 0; i < slots.length; i++) {
      var time = slots[i].dataset.time;
      if (blockedTimes.has(time)) continue;
      if (isPastTimeSlot(dateStr, time)) continue;
      if (isSlotTaken(bookings, dateStr, time)) continue;
      return time;
    }
    return null;
  }

  function findNextAvailableDate(maxDays, bookings) {
    bookings = bookings || getOccupancyBookings();
    var cursor = new Date(todayStart);

    for (var i = 0; i < maxDays; i++) {
      var dateStr = toISODate(cursor);
      if (getDateAvailability(dateStr, bookings).availableCount > 0) return dateStr;
      cursor.setDate(cursor.getDate() + 1);
    }

    return todayString;
  }

  function alignSelectionWithAvailability(bookings) {
    bookings = bookings || getOccupancyBookings();
    var availability = selectedDate ? getDateAvailability(selectedDate, bookings) : { availableCount: 0 };

    if (!selectedDate || availability.availableCount <= 0) {
      selectedDate = findNextAvailableDate(90, bookings);
      selectedTime = null;
    }

    if (selectedDate && selectedTime) {
      if (getBlockedTimeSet().has(selectedTime) || isPastTimeSlot(selectedDate, selectedTime) || isSlotTaken(bookings, selectedDate, selectedTime)) {
        selectedTime = null;
      }
    }

    selectedDateObj = parseDate(selectedDate);
    calYear = selectedDateObj.getFullYear();
    calMonth = selectedDateObj.getMonth();
  }

  function getSelectionStage() {
    if (!selectedDate) return 'date';
    if (!selectedTime) return 'time';
    if (!reasonInput.value.trim()) return 'reason';
    return 'ready';
  }

  function updateHeroSpotlight(bookings, availableCount) {
    var spotlightDate = selectedDate || findNextAvailableDate(90, bookings);
    var firstAvailableTime = spotlightDate ? getFirstAvailableTime(spotlightDate, bookings) : null;
    var stage = getSelectionStage();

    if (heroNextDate) heroNextDate.textContent = spotlightDate ? formatDate(spotlightDate) : '正在计算可预约日期';

    if (heroNextTime) {
      if (selectedDate && selectedTime) heroNextTime.textContent = '当前已锁定 ' + selectedTime + '，补上说明后就能提交。';
      else if (spotlightDate && firstAvailableTime) heroNextTime.textContent = '推荐时段 ' + firstAvailableTime + '，可以从这一步开始。';
      else heroNextTime.textContent = '当前配置里没有空余时段，成可以到后台重新开放时间。';
    }

    if (heroNextStatus) {
      if (runtime.remoteEnabled && runtime.syncError) heroNextStatus.textContent = '在线后台暂时未响应';
      else if (stage === 'time') heroNextStatus.textContent = '当前还有 ' + availableCount + ' 个时段可选';
      else if (stage === 'reason') heroNextStatus.textContent = '只差一句说明就能提交';
      else if (stage === 'ready') heroNextStatus.textContent = '信息完整，可直接提交申请';
      else heroNextStatus.textContent = '先挑一个合适的日期开始';
    }
  }

  function updateFlowState(availableCount) {
    var stage = getSelectionStage();
    var order = ['date', 'time', 'reason'];
    var stageIndex = stage === 'ready' ? order.length : order.indexOf(stage);

    flowItems.forEach(function(item) {
      var itemIndex = order.indexOf(item.dataset.flowStep);
      item.classList.toggle('booking-flow__item--done', itemIndex < stageIndex || stage === 'ready');
      item.classList.toggle('booking-flow__item--active', stage !== 'ready' && itemIndex === stageIndex);
    });

    if (stageLabel) {
      if (stage === 'time') stageLabel.textContent = availableCount > 0 ? '第 2 步：挑一个你方便的时段。' : '当前开放时段已经满了，切换日期或等成开放新时间。';
      else if (stage === 'reason') stageLabel.textContent = '第 3 步：写一句说明，帮助成更快确认。';
      else if (stage === 'ready') stageLabel.textContent = '已完成全部步骤，确认无误后就提交预约。';
      else stageLabel.textContent = '第 1 步：先看一下系统为你推荐的日期。';
    }

    if (submitBtn) {
      if (runtime.submitPending) {
        submitBtn.textContent = runtime.remoteEnabled ? '正在同步预约...' : '正在保存预约...';
        submitBtn.disabled = true;
      } else {
        if (stage === 'time') submitBtn.textContent = '先选择时段';
        else if (stage === 'reason') submitBtn.textContent = '补充预约说明';
        else if (stage === 'ready') submitBtn.textContent = '提交预约申请';
        else submitBtn.textContent = '先选择日期';
        submitBtn.disabled = stage !== 'ready';
      }
    }

    if (formStatusNote) {
      if (runtime.submitPending) formStatusNote.textContent = runtime.remoteEnabled ? '正在把预约写入在线后台，请稍候。' : '正在保存当前预约，请稍候。';
      else if (stage === 'time') formStatusNote.textContent = '日期已经为你准备好了，下一步只需要锁定一个时段。';
      else if (stage === 'reason') formStatusNote.textContent = '已选 ' + formatDate(selectedDate) + ' · ' + selectedTime + '，再写一句说明就能提交。';
      else if (stage === 'ready') formStatusNote.textContent = '已选 ' + formatDate(selectedDate) + ' · ' + selectedTime + '，现在可以正式提交预约申请。';
      else formStatusNote.textContent = '完成日期、时段和预约说明后，就可以正式提交。';
    }
  }

  function updateSelectionSummary(bookings, availableCount) {
    if (selectedDateLabel) selectedDateLabel.textContent = selectedDate ? formatDate(selectedDate) : '尚未选择';
    if (selectedTimeLabel) selectedTimeLabel.textContent = selectedTime || '尚未选择';

    if (!selectedDate) {
      if (availableCountLabel) availableCountLabel.textContent = '先选日期';
      if (timePickerHint) timePickerHint.textContent = '请选择日期后查看可预约时段。';
      updateHeroSpotlight(bookings, availableCount);
      updateFlowState(availableCount);
      return;
    }

    if (selectedTime) {
      if (availableCountLabel) availableCountLabel.textContent = '已锁定';
      if (timePickerHint) timePickerHint.textContent = '当前时段可提交预约，继续填写信息即可。';
      updateHeroSpotlight(bookings, availableCount);
      updateFlowState(availableCount);
      return;
    }

    if (availableCount <= 0) {
      if (availableCountLabel) availableCountLabel.textContent = '当前不可约';
      if (timePickerHint) timePickerHint.textContent = '这个日期现在没有开放时段了，换一天试试。';
      updateHeroSpotlight(bookings, availableCount);
      updateFlowState(availableCount);
      return;
    }

    if (availableCountLabel) availableCountLabel.textContent = availableCount + ' 个可选';
    if (timePickerHint) timePickerHint.textContent = '已自动过滤关闭、占用和过期时段，选择你方便的时间即可。';
    updateHeroSpotlight(bookings, availableCount);
    updateFlowState(availableCount);
  }

  function refreshTimeSlots(bookings) {
    var blockedTimes = getBlockedTimeSet();
    var slots = getBookingSlots();
    var availableCount = 0;
    var selectedStillValid = false;

    slots.forEach(function(slot) {
      var time = slot.dataset.time;
      var blocked = blockedTimes.has(time);
      var occupied = false;
      var past = false;
      var disabled = blocked || !selectedDate;

      if (!disabled) {
        past = isPastTimeSlot(selectedDate, time);
        occupied = isSlotTaken(bookings, selectedDate, time);
        disabled = past || occupied;
      }

      var isSelected = selectedTime === time && !disabled;

      slot.disabled = disabled;
      slot.classList.toggle('time-slot--disabled', disabled);
      slot.classList.toggle('time-slot--occupied', occupied);
      slot.classList.toggle('time-slot--past', past);
      slot.classList.toggle('time-slot--selected', isSelected);
      slot.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

      if (!disabled) availableCount++;
      if (isSelected) selectedStillValid = true;
    });

    if (!selectedStillValid) selectedTime = null;
    updateSelectionSummary(bookings, availableCount);
  }

  function renderCalendar() {
    if (calYear < todayStart.getFullYear() || (calYear === todayStart.getFullYear() && calMonth < todayStart.getMonth())) {
      calYear = todayStart.getFullYear();
      calMonth = todayStart.getMonth();
    }

    var label = $('#cal-month-label');
    label.textContent = calYear + ' 年 ' + (calMonth + 1) + ' 月';
    calPrev.disabled = calYear === todayStart.getFullYear() && calMonth === todayStart.getMonth();

    var grid = $('#cal-grid');
    var weekdays = Array.from(grid.querySelectorAll('.calendar__weekday'));
    grid.innerHTML = '';
    weekdays.forEach(function(weekday) { grid.appendChild(weekday); });

    var bookings = getOccupancyBookings();
    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var prevMonthDays = new Date(calYear, calMonth, 0).getDate();

    for (var i = firstDay - 1; i >= 0; i--) {
      var prevBtn = document.createElement('button');
      prevBtn.className = 'calendar__day calendar__day--other-month';
      prevBtn.textContent = prevMonthDays - i;
      prevBtn.type = 'button';
      grid.appendChild(prevBtn);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var btn = document.createElement('button');
      btn.className = 'calendar__day';
      btn.textContent = d;
      btn.type = 'button';

      var thisDate = new Date(calYear, calMonth, d);
      var dateStr = toISODate(thisDate);
      btn.dataset.date = dateStr;

      if (thisDate < todayStart) btn.classList.add('calendar__day--disabled');
      if (thisDate.getTime() === todayStart.getTime()) btn.classList.add('calendar__day--today');

      if (thisDate >= todayStart) {
        var availability = getDateAvailability(dateStr, bookings);
        if (availability.availableCount === 0) {
          btn.classList.add('calendar__day--full');
          btn.title = '当天没有开放时段';
        } else if (availability.occupiedCount > 0) {
          btn.classList.add('calendar__day--busy');
          btn.title = '部分时段已被占用';
        }
      }

      if (dateStr === selectedDate) btn.classList.add('calendar__day--selected');
      grid.appendChild(btn);

      if (thisDate >= todayStart) {
        btn.addEventListener('click', function() {
          var nextDate = this.dataset.date;
          if (selectedDate !== nextDate) selectedTime = null;
          selectedDate = nextDate;
          renderCalendar();
          refreshTimeSlots(getOccupancyBookings());
          if (window.innerWidth <= 768 && timePicker) {
            setTimeout(function() {
              timePicker.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
          }
        });
      }
    }

    var totalCells = firstDay + daysInMonth;
    var remaining = (7 - (totalCells % 7)) % 7;
    for (var j = 1; j <= remaining; j++) {
      var nextBtn = document.createElement('button');
      nextBtn.className = 'calendar__day calendar__day--other-month';
      nextBtn.textContent = j;
      nextBtn.type = 'button';
      grid.appendChild(nextBtn);
    }
  }

  async function parseApiResponse(response) {
    var text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('服务器返回了无法识别的数据');
    }
  }

  async function apiRequest(path, options) {
    options = options || {};

    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    var hasBody = options.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';

    var response = await fetch(API_BASE_URL + path, {
      method: options.method || 'GET',
      headers: headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });

    var data = await parseApiResponse(response);
    if (!response.ok || (data && data.ok === false)) {
      throw new Error((data && data.error) || '请求失败，请稍后再试');
    }

    return data || {};
  }

  function getAdminHeaders(password) {
    return {
      Authorization: 'Bearer ' + String(password || runtime.adminPassword || '')
    };
  }

  function applySettingsPayload(payload) {
    runtime.timeConfig = normalizeTimeConfig(payload);
    runtime.disabledTimes = normalizeDisabledTimes(payload.disabledTimes);
    runtime.adminDisabledDraft = runtime.disabledTimes.slice();
    renderBookingTimeSlots();
    renderAdminTimeSettings();
  }

  function syncAllViews() {
    alignSelectionWithAvailability(getOccupancyBookings());
    renderCalendar();
    refreshTimeSlots(getOccupancyBookings());
    renderMyBookings();
    renderAdminList();
    renderAdminTimeSettings();
    updateConnectionUI();
  }

  async function syncRemotePublic(options) {
    options = options || {};
    if (!runtime.remoteEnabled) return;
    if (runtime.publicSyncPromise) return runtime.publicSyncPromise;

    runtime.publicSyncPromise = (async function() {
      runtime.syncError = '';
      updateConnectionUI();
      try {
        // ✅ 修复：去掉重复的 /api 前缀，路径直接从 /settings 开始
        var results = await Promise.all([
          apiRequest('/settings'),
          apiRequest('/availability'),
          apiRequest('/bookings?clientId=' + encodeURIComponent(runtime.clientId))
        ]);

        applySettingsPayload(results[0]);
        runtime.publicBookings = Array.isArray(results[1].bookings) ? results[1].bookings.map(normalizeBooking).filter(Boolean) : [];
        runtime.myBookings = Array.isArray(results[2].bookings) ? results[2].bookings.map(normalizeBooking).filter(Boolean) : [];
        runtime.lastSyncAt = new Date().toISOString();
        syncAllViews();
      } catch (error) {
        runtime.syncError = error && error.message ? error.message : '在线后台连接失败';
        updateConnectionUI();
        if (!options.silent) showToast(runtime.syncError);
      } finally {
        runtime.publicSyncPromise = null;
        updateConnectionUI();
      }
    })();

    return runtime.publicSyncPromise;
  }

  async function syncRemoteAdmin(options) {
    options = options || {};
    if (!runtime.remoteEnabled || !runtime.adminPassword) return;
    if (runtime.adminSyncPromise) return runtime.adminSyncPromise;

    runtime.adminSyncPromise = (async function() {
      updateConnectionUI();
      try {
        // ✅ 修复：去掉重复的 /api 前缀
        var data = await apiRequest('/admin/bookings', {
          headers: getAdminHeaders()
        });
        runtime.adminBookings = Array.isArray(data.bookings) ? data.bookings.map(normalizeBooking).filter(Boolean) : [];
        renderAdminList();
      } catch (error) {
        runtime.syncError = error && error.message ? error.message : '后台同步失败';
        if (!options.silent) showToast(runtime.syncError);
        throw error;
      } finally {
        runtime.adminSyncPromise = null;
        updateConnectionUI();
      }
    })();

    return runtime.adminSyncPromise;
  }

  function startRemotePolling() {
    if (!runtime.remoteEnabled) return;
    stopRemotePolling();
    runtime.pollTimer = window.setInterval(function() {
      if (document.hidden) return;
      syncRemotePublic({ silent: true });
      if (runtime.adminPassword && !adminPage.classList.contains('hidden')) syncRemoteAdmin({ silent: true });
    }, APP_CONFIG.pollIntervalMs);
  }

  function stopRemotePolling() {
    if (runtime.pollTimer) {
      clearInterval(runtime.pollTimer);
      runtime.pollTimer = null;
    }
  }

  function renderMyBookings() {
    var container = $('#my-bookings-list');
    var bookings = getMyBookings();
    if (bookingCountBadge) bookingCountBadge.textContent = bookings.length + ' 条';

    if (bookings.length === 0) {
      container.innerHTML = '' +
        '<div class="my-booking-empty">' +
        '<div class="my-booking-empty__title">你的预约记录还没开始</div>' +
        '<div class="my-booking-empty__desc">' + (runtime.remoteEnabled ? '这个区域只展示这台设备提交的预约。先从上面的日期和时段里挑一个合适的窗口。' : '先从上面的日期和时段里挑一个合适的窗口，提交后这里就会显示处理状态。') + '</div>' +
        '<a href="#booking" class="btn btn-secondary btn-sm">去选择时段</a>' +
        '</div>';
      return;
    }

    var sorted = bookings.slice().sort(function(a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    var html = '';

    sorted.forEach(function(booking, index) {
      var statusClass = 'pending';
      var statusText = '处理中';
      if (booking.status === 'accepted') { statusClass = 'accepted'; statusText = '已同意'; }
      else if (booking.status === 'rejected') { statusClass = 'rejected'; statusText = '已拒绝'; }

      html += '<div class="my-booking-item' + (index === 0 ? ' my-booking-item--latest' : '') + '">';
      html += '<div class="my-booking-item__header">';
      html += '<span class="my-booking-item__datetime">' + formatDate(booking.date) + '　' + escapeHTML(booking.time) + '</span>';
      html += '<span class="status-badge status-badge--' + statusClass + '">' + statusText + '</span>';
      html += '</div>';
      if (booking.reason) html += '<div class="my-booking-item__reason">事由：' + escapeHTML(booking.reason) + '</div>';
      html += '<div class="my-booking-item__meta">提交时间：' + formatSubmittedAt(booking.createdAt) + '</div>';
      if (booking.status === 'pending') html += '<div class="my-booking-item__note">' + (runtime.remoteEnabled ? '等待成审核中，结果会自动从在线后台同步到这里。' : '等待成审核中，结果会同步显示在这里。') + '</div>';
      if (booking.status === 'rejected' && booking.rejectReason) html += '<div class="my-booking-item__reject-reason"><b>成的回复：</b>' + escapeHTML(booking.rejectReason) + '</div>';
      if (booking.status === 'accepted') html += '<div class="my-booking-item__approved"><b>成已同意此预约。</b> 请按时赴约。</div>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  function renderAdminStats(bookings) {
    if (!adminStats) return;

    var counts = bookings.reduce(function(result, booking) {
      result.total++;
      if (booking.status === 'accepted') result.accepted++;
      else if (booking.status === 'rejected') result.rejected++;
      else result.pending++;
      return result;
    }, { total: 0, pending: 0, accepted: 0, rejected: 0 });

    adminStats.innerHTML = [
      { label: '总预约', value: counts.total },
      { label: '待处理', value: counts.pending },
      { label: '已同意', value: counts.accepted },
      { label: '已拒绝', value: counts.rejected }
    ].map(function(stat) {
      return '<div class="stat-card"><span class="stat-card__label">' + stat.label + '</span><span class="stat-card__value">' + stat.value + '</span></div>';
    }).join('');
  }

  function renderAdminList() {
    var bookings = getAdminBookings();
    renderAdminStats(bookings);
    adminList.innerHTML = '';

    var sorted = bookings.slice().sort(function(a, b) {
      var order = { pending: 0, accepted: 1, rejected: 2 };
      var orderA = order[a.status] !== undefined ? order[a.status] : 3;
      var orderB = order[b.status] !== undefined ? order[b.status] : 3;
      if (orderA !== orderB) return orderA - orderB;
      return getBookingDateTimeValue(a) - getBookingDateTimeValue(b);
    });

    if (sorted.length === 0) {
      adminList.innerHTML = '<li class="admin-empty">' + (runtime.remoteEnabled ? '暂无在线预约请求。' : '暂无预约请求，成可以安心休息。') + '</li>';
      return;
    }

    sorted.forEach(function(booking) {
      var li = document.createElement('li');
      li.className = 'admin-item';

      var statusBadge = '';
      if (booking.status === 'pending') statusBadge = '<span class="status-badge status-badge--pending">待处理</span>';
      else if (booking.status === 'accepted') statusBadge = '<span class="status-badge status-badge--accepted">已同意</span>';
      else if (booking.status === 'rejected') statusBadge = '<span class="status-badge status-badge--rejected">已拒绝</span>';

      var html = '';
      html += '<div class="admin-item__top">';
      html += '<span class="admin-item__meta">#' + escapeHTML(booking.id) + '</span>';
      html += statusBadge;
      html += '</div>';
      html += '<div class="admin-item__field"><b>日期：</b>' + formatDate(booking.date) + '　' + escapeHTML(booking.time) + '</div>';
      html += '<div class="admin-item__field"><b>事由：</b>' + (escapeHTML(booking.reason) || '—') + '</div>';
      html += '<div class="admin-item__field"><b>提交：</b>' + formatSubmittedAt(booking.createdAt) + '</div>';

      if (booking.status === 'rejected' && booking.rejectReason) {
        html += '<div class="admin-item__field admin-item__danger"><b>拒绝理由：</b>' + escapeHTML(booking.rejectReason) + '</div>';
      }

      if (booking.status === 'pending') {
        html += '<div class="admin-actions admin-actions--stack">';
        html += '<input class="form-input admin-reject-input" type="text" placeholder="拒绝理由（拒绝时必填）" data-reject-id="' + escapeHTML(booking.id) + '">';
        html += '<div class="admin-actions__row">';
        html += '<button class="btn-accept" data-action="accept" data-id="' + escapeHTML(booking.id) + '">同意</button>';
        html += '<button class="btn-reject" data-action="reject" data-id="' + escapeHTML(booking.id) + '">拒绝</button>';
        html += '<button class="btn btn-secondary btn-sm btn-ghost" data-action="delete" data-id="' + escapeHTML(booking.id) + '">删除</button>';
        html += '</div></div>';
      } else {
        html += '<div class="admin-actions">';
        html += '<button class="btn btn-secondary btn-sm btn-ghost" data-action="delete" data-id="' + escapeHTML(booking.id) + '">删除记录</button>';
        html += '</div>';
      }

      li.innerHTML = html;
      adminList.appendChild(li);
    });

    adminList.querySelectorAll('[data-action]').forEach(function(button) {
      button.addEventListener('click', async function() {
        var action = button.dataset.action;
        var bookingId = button.dataset.id;
        if (!action || !bookingId) return;

        if (runtime.remoteEnabled) await handleRemoteAdminAction(action, bookingId);
        else handleLocalAdminAction(action, bookingId);
      });
    });
  }

  function handleLocalAdminAction(action, bookingId) {
    var bookings = getLocalBookings();
    var index = bookings.findIndex(function(item) {
      return item.id === bookingId;
    });
    if (index === -1) return;

    if (action === 'accept') {
      bookings[index].status = 'accepted';
      bookings[index].rejectReason = '';
      setLocalBookings(bookings);
      showToast('成已同意该预约');
    } else if (action === 'reject') {
      var rejectInput = adminList.querySelector('[data-reject-id="' + bookingId + '"]');
      var rejectReason = rejectInput ? rejectInput.value.trim() : '';
      if (!rejectReason) {
        showToast('请填写拒绝理由');
        if (rejectInput) {
          rejectInput.classList.add('form-input--error');
          rejectInput.focus();
          setTimeout(function() { rejectInput.classList.remove('form-input--error'); }, 1500);
        }
        return;
      }
      bookings[index].status = 'rejected';
      bookings[index].rejectReason = rejectReason;
      setLocalBookings(bookings);
      showToast('成已拒绝该预约');
    } else if (action === 'delete') {
      bookings.splice(index, 1);
      setLocalBookings(bookings);
      showToast('记录已删除');
    }

    syncAllViews();
  }

  async function handleRemoteAdminAction(action, bookingId) {
    try {
      if (action === 'accept') {
        // ✅ 修复：去掉重复的 /api 前缀
        await apiRequest('/admin/bookings/' + encodeURIComponent(bookingId) + '/accept', {
          method: 'POST',
          headers: getAdminHeaders()
        });
        showToast('成已同意该预约');
      } else if (action === 'reject') {
        var rejectInput = adminList.querySelector('[data-reject-id="' + bookingId + '"]');
        var rejectReason = rejectInput ? rejectInput.value.trim() : '';
        if (!rejectReason) {
          showToast('请填写拒绝理由');
          if (rejectInput) {
            rejectInput.classList.add('form-input--error');
            rejectInput.focus();
            setTimeout(function() { rejectInput.classList.remove('form-input--error'); }, 1500);
          }
          return;
        }

        // ✅ 修复：去掉重复的 /api 前缀
        await apiRequest('/admin/bookings/' + encodeURIComponent(bookingId) + '/reject', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: { rejectReason: rejectReason }
        });
        showToast('成已拒绝该预约');
      } else if (action === 'delete') {
        // ✅ 修复：去掉重复的 /api 前缀
        await apiRequest('/admin/bookings/' + encodeURIComponent(bookingId), {
          method: 'DELETE',
          headers: getAdminHeaders()
        });
        showToast('记录已删除');
      }

      await Promise.all([
        syncRemotePublic({ silent: true }),
        syncRemoteAdmin({ silent: true })
      ]);
      syncAllViews();
    } catch (error) {
      showToast(error && error.message ? error.message : '在线后台更新失败');
    }
  }

  async function saveAdminTimeSettings() {
    var disabledTimes = normalizeDisabledTimes(runtime.adminDisabledDraft);
    runtime.settingsSavePending = true;
    renderAdminTimeSettings();

    try {
      if (runtime.remoteEnabled) {
        // ✅ 修复：去掉重复的 /api 前缀
        var data = await apiRequest('/admin/settings/disabled-times', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: { disabledTimes: disabledTimes }
        });
        applySettingsPayload(data);
        await Promise.all([
          syncRemotePublic({ silent: true }),
          syncRemoteAdmin({ silent: true })
        ]);
      } else {
        runtime.disabledTimes = disabledTimes.slice();
        runtime.adminDisabledDraft = disabledTimes.slice();
        setLocalSettings({ disabledTimes: runtime.disabledTimes });
      }

      selectedTime = runtime.disabledTimes.indexOf(selectedTime) !== -1 ? null : selectedTime;
      syncAllViews();
      showToast('时段设置已保存');
    } catch (error) {
      showToast(error && error.message ? error.message : '保存时段设置失败');
    } finally {
      runtime.settingsSavePending = false;
      renderAdminTimeSettings();
    }
  }

  function updateReasonCounter() {
    if (reasonCounter) reasonCounter.textContent = reasonInput.value.length + ' / 200';
    var bookings = getOccupancyBookings();
    var availableCount = selectedDate ? getDateAvailability(selectedDate, bookings).availableCount : 0;
    updateFlowState(availableCount);
    updateHeroSpotlight(bookings, availableCount);
  }

  function openAdminLogin() {
    if (runtime.remoteEnabled && runtime.adminPassword) {
      syncRemoteAdmin({ silent: true })
        .then(function() {
          if (loginError) loginError.classList.add('hidden');
          switchPage('admin');
        })
        .catch(function() {
          runtime.adminPassword = '';
          adminPassword.value = '';
          switchPage('login');
        });
      return;
    }

    adminPassword.value = '';
    if (loginError) {
      loginError.textContent = loginErrorDefaultText;
      loginError.classList.add('hidden');
    }
    switchPage('login');
  }

  calPrev.addEventListener('click', function() {
    if (calPrev.disabled) return;
    calMonth--;
    if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }
    renderCalendar();
  });

  calNext.addEventListener('click', function() {
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }
    renderCalendar();
  });

  bookingForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    var reason = reasonInput.value.trim();

    if (!selectedDate) { showToast('请选择预约日期'); return; }
    if (!selectedTime) { showToast('请选择预约时段'); return; }
    if (!reason) { showToast('请填写预约事由'); return; }
    if (getBlockedTimeSet().has(selectedTime)) { showToast('该时段当前未开放预约'); return; }

    var bookings = getOccupancyBookings();
    if (isPastTimeSlot(selectedDate, selectedTime)) {
      showToast('所选时段已经过去了，请重新选择');
      refreshTimeSlots(bookings);
      return;
    }
    if (isSlotTaken(bookings, selectedDate, selectedTime)) {
      showToast('该时段刚刚被占用，请重新选择其他时间');
      refreshTimeSlots(bookings);
      return;
    }

    runtime.submitPending = true;
    updateReasonCounter();
    updateConnectionUI();

    try {
      if (runtime.remoteEnabled) {
        // ✅ 修复：去掉重复的 /api 前缀
        await apiRequest('/bookings', {
          method: 'POST',
          body: {
            clientId: runtime.clientId,
            reason: reason,
            date: selectedDate,
            time: selectedTime
          }
        });
        await syncRemotePublic({ silent: true });
        if (runtime.adminPassword) await syncRemoteAdmin({ silent: true });
      } else {
        var localBookings = getLocalBookings();
        localBookings.push({
          id: generateId(),
          clientId: runtime.clientId,
          reason: reason,
          date: selectedDate,
          time: selectedTime,
          status: 'pending',
          rejectReason: '',
          createdAt: new Date().toISOString()
        });
        setLocalBookings(localBookings);
      }

      bookingForm.reset();
      selectedTime = null;
      updateReasonCounter();
      syncAllViews();

      showToast(runtime.remoteEnabled ? '预约已提交，已同步到在线后台' : '预约已提交，已为你切换到「我的预约」');
      setActiveNav('#my-bookings-section');

      setTimeout(function() {
        var section = $('#my-bookings-section');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    } catch (error) {
      showToast(error && error.message ? error.message : '提交失败，请稍后再试');
      if (runtime.remoteEnabled) syncRemotePublic({ silent: true });
    } finally {
      runtime.submitPending = false;
      updateReasonCounter();
      updateConnectionUI();
    }
  });

  logoLink.addEventListener('click', function(event) {
    event.preventDefault();
    logoClicks++;
    clearTimeout(logoTimer);
    logoTimer = setTimeout(function() { logoClicks = 0; }, 1500);

    if (logoClicks >= 5) {
      logoClicks = 0;
      openAdminLogin();
      return;
    }

    switchPage('booking');
    setActiveNav('#booking');
  });

  loginBtn.addEventListener('click', async function() {
    var password = adminPassword.value.trim();
    if (!password) {
      loginError.textContent = '请输入后台密码。';
      loginError.classList.remove('hidden');
      adminPassword.classList.add('form-input--error');
      setTimeout(function() { adminPassword.classList.remove('form-input--error'); }, 1500);
      return;
    }

    if (!runtime.remoteEnabled) {
      if (LOCAL_ADMIN_PASSWORDS.indexOf(password) !== -1) {
        adminPassword.value = '';
        loginError.textContent = loginErrorDefaultText;
        loginError.classList.add('hidden');
        renderAdminList();
        renderAdminTimeSettings();
        switchPage('admin');
      } else {
        loginError.textContent = loginErrorDefaultText;
        loginError.classList.remove('hidden');
        adminPassword.classList.add('form-input--error');
        setTimeout(function() { adminPassword.classList.remove('form-input--error'); }, 1500);
      }
      return;
    }

    var originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = '验证中...';

    try {
      runtime.adminPassword = password;
      await Promise.all([
        syncRemotePublic({ silent: true }),
        syncRemoteAdmin({ silent: true })
      ]);
      adminPassword.value = '';
      loginError.textContent = loginErrorDefaultText;
      loginError.classList.add('hidden');
      switchPage('admin');
    } catch (error) {
      runtime.adminPassword = '';
      runtime.adminBookings = [];
      renderAdminList();
      loginError.textContent = error && error.message ? error.message : loginErrorDefaultText;
      loginError.classList.remove('hidden');
      adminPassword.classList.add('form-input--error');
      setTimeout(function() { adminPassword.classList.remove('form-input--error'); }, 1500);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
    }
  });

  adminPassword.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginBtn.click();
    }
  });

  if (adminTimeSaveBtn) {
    adminTimeSaveBtn.addEventListener('click', function() {
      saveAdminTimeSettings();
    });
  }

  if (adminTimeResetBtn) {
    adminTimeResetBtn.addEventListener('click', function() {
      runtime.adminDisabledDraft = [];
      renderAdminTimeSettings();
    });
  }

  cancelLoginBtn.addEventListener('click', function() {
    switchPage('booking');
    setActiveNav('#booking');
  });

  backBtn.addEventListener('click', function() {
    renderMyBookings();
    switchPage('booking');
    setActiveNav('#booking');
  });

  jumpLinks.forEach(function(link) {
    link.addEventListener('click', function(event) {
      var target = $(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      switchPage('booking', false);
      setActiveNav(link.getAttribute('href'));
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  window.addEventListener('storage', function(event) {
    if (runtime.remoteEnabled) return;
    if (event.key && event.key !== LOCAL_STORAGE_KEY && event.key !== LOCAL_SETTINGS_KEY) return;
    runtime.disabledTimes = getLocalSettings().disabledTimes;
    runtime.adminDisabledDraft = runtime.disabledTimes.slice();
    renderBookingTimeSlots();
    syncAllViews();
  });

  document.addEventListener('visibilitychange', function() {
    if (!runtime.remoteEnabled || document.hidden) return;
    syncRemotePublic({ silent: true });
    if (runtime.adminPassword && !adminPage.classList.contains('hidden')) syncRemoteAdmin({ silent: true });
  });

  if (footerYear) footerYear.textContent = String(new Date().getFullYear());
  if (reasonInput) reasonInput.addEventListener('input', updateReasonCounter);

  renderAdminTimeSettings();
  updateConnectionUI();
  updateReasonCounter();
  syncAllViews();
  switchPage('booking');
  setActiveNav('#booking');

  if (runtime.remoteEnabled) {
    syncRemotePublic({ silent: true });
    startRemotePolling();
  }
})();
