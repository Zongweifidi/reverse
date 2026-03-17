const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '878888');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(DATA_DIR, 'bookings.json'));
const CONFIG_FILE = path.resolve(process.env.SCHEDULE_CONFIG_FILE || path.join(__dirname, 'schedule-config.json'));
const STATIC_FILES = {
  '/': 'arena-seng.html',
  '/arena-seng.html': 'arena-seng.html',
  '/arena-seng-app.js': 'arena-seng-app.js'
};
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};
const DEFAULT_TIME_CONFIG = {
  timeGroups: [
    { label: '上午', times: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] },
    { label: '下午', times: ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30'] }
  ]
};
const BOOKING_WINDOW_DAYS = 90;

let scheduleConfig = DEFAULT_TIME_CONFIG;
let state = {
  bookings: [],
  settings: {
    disabledTimes: []
  }
};
let writeQueue = Promise.resolve();

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizeTimeString(value) {
  return String(value || '').trim();
}

function normalizeTimeConfig(raw) {
  const groups = Array.isArray(raw && raw.timeGroups) ? raw.timeGroups : DEFAULT_TIME_CONFIG.timeGroups;
  const normalizedGroups = groups
    .map((group) => {
      const label = String(group && group.label ? group.label : '').trim() || '时段';
      const times = Array.isArray(group && group.times)
        ? group.times
            .map(normalizeTimeString)
            .filter((time, index, list) => /^\d{2}:\d{2}$/.test(time) && list.indexOf(time) === index)
        : [];

      if (times.length === 0) return null;
      return { label, times };
    })
    .filter(Boolean);

  return {
    timeGroups: normalizedGroups.length > 0 ? normalizedGroups : DEFAULT_TIME_CONFIG.timeGroups
  };
}

function getConfiguredTimes() {
  return scheduleConfig.timeGroups.reduce((result, group) => {
    group.times.forEach((time) => {
      if (!result.includes(time)) result.push(time);
    });
    return result;
  }, []);
}

function getAllowedTimeSet() {
  return new Set(getConfiguredTimes());
}

function normalizeDisabledTimes(values) {
  const allowedTimes = getAllowedTimeSet();
  if (!Array.isArray(values)) return [];

  return values
    .map(normalizeTimeString)
    .filter((time, index, list) => allowedTimes.has(time) && list.indexOf(time) === index);
}

function normalizeSettings(raw) {
  return {
    disabledTimes: normalizeDisabledTimes(raw && raw.disabledTimes)
  };
}

function normalizeBooking(raw) {
  const createdAt = new Date(raw && raw.createdAt ? raw.createdAt : Date.now());
  const normalizedCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString();
  const status = raw && (raw.status === 'accepted' || raw.status === 'rejected') ? raw.status : 'pending';

  return {
    id: String((raw && raw.id) || `bk_${randomUUID()}`),
    clientId: String((raw && raw.clientId) || '').trim(),
    reason: String((raw && raw.reason) || '').trim(),
    date: String((raw && raw.date) || ''),
    time: String((raw && raw.time) || ''),
    status,
    rejectReason: String((raw && raw.rejectReason) || '').trim(),
    createdAt: normalizedCreatedAt
  };
}

function normalizeState(raw) {
  if (Array.isArray(raw)) {
    return {
      bookings: raw.map(normalizeBooking),
      settings: { disabledTimes: [] }
    };
  }

  if (raw && typeof raw === 'object') {
    return {
      bookings: Array.isArray(raw.bookings) ? raw.bookings.map(normalizeBooking) : [],
      settings: normalizeSettings(raw.settings)
    };
  }

  return {
    bookings: [],
    settings: { disabledTimes: [] }
  };
}

function sortBookings(bookings) {
  return bookings.slice().sort((a, b) => {
    const order = { pending: 0, accepted: 1, rejected: 2 };
    const orderA = order[a.status] ?? 3;
    const orderB = order[b.status] ?? 3;
    if (orderA !== orderB) return orderA - orderB;
    const timeA = new Date(`${a.date}T${a.time || '00:00'}:00`).getTime();
    const timeB = new Date(`${b.date}T${b.time || '00:00'}:00`).getTime();
    return timeA - timeB;
  });
}

function isAuthorized(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice(7).trim() === ADMIN_PASSWORD;
}

function isTimeDisabled(time) {
  return state.settings.disabledTimes.includes(time);
}

function isSlotTaken(date, time, ignoreId) {
  return state.bookings.some((booking) => {
    if (ignoreId && booking.id === ignoreId) return false;
    return booking.date === date && booking.time === time && booking.status !== 'rejected';
  });
}

function isPastDateTime(date, time) {
  const appointment = new Date(`${date}T${time}:00`);
  if (Number.isNaN(appointment.getTime())) return true;
  return appointment.getTime() <= Date.now();
}

function isDateWithinWindow(date) {
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return false;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastAllowed = new Date(todayStart);
  lastAllowed.setDate(lastAllowed.getDate() + BOOKING_WINDOW_DAYS);

  return target >= todayStart && target <= lastAllowed;
}

function sanitizeAvailability(booking) {
  return {
    id: booking.id,
    date: booking.date,
    time: booking.time,
    status: booking.status,
    createdAt: booking.createdAt
  };
}

function sanitizeSettings() {
  return {
    timeGroups: scheduleConfig.timeGroups,
    disabledTimes: state.settings.disabledTimes
  };
}

async function ensureScheduleConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    scheduleConfig = normalizeTimeConfig(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    scheduleConfig = DEFAULT_TIME_CONFIG;
    await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_TIME_CONFIG, null, 2) + '\n', 'utf8');
  }
}

async function ensureState() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    state = normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = normalizeState(null);
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  state.settings = normalizeSettings(state.settings);
}

async function persistState() {
  const payload = JSON.stringify({
    bookings: state.bookings,
    settings: state.settings
  }, null, 2) + '\n';
  const tmpFile = `${DATA_FILE}.tmp`;

  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(tmpFile, payload, 'utf8');
    await fs.rename(tmpFile, DATA_FILE);
  });

  return writeQueue;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error('请求体过大');
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw new Error('请求体不是有效的 JSON');
  }
}

function validateCreatePayload(payload) {
  const clientId = String(payload.clientId || '').trim();
  const reason = String(payload.reason || '').trim();
  const date = String(payload.date || '').trim();
  const time = normalizeTimeString(payload.time);
  const allowedTimes = getAllowedTimeSet();

  if (!clientId) return '缺少 clientId';
  if (!reason) return '请填写预约事由';
  if (reason.length > 200) return '预约事由不能超过 200 个字';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '日期格式不正确';
  if (!allowedTimes.has(time)) return '时段不可用';
  if (isTimeDisabled(time)) return '该时段当前未开放预约';
  if (!isDateWithinWindow(date)) return '日期不在可预约范围内';
  if (isPastDateTime(date, time)) return '所选时段已经过去了';
  if (isSlotTaken(date, time)) return '该时段刚刚被占用，请重新选择其他时间';

  return '';
}

async function serveStatic(res, pathname) {
  const relativeFile = STATIC_FILES[pathname];
  if (!relativeFile) {
    json(res, 404, { ok: false, error: '未找到页面' });
    return;
  }

  const filePath = path.join(__dirname, relativeFile);
  const ext = path.extname(filePath);
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  try {
    const content = await fs.readFile(filePath);
    setCorsHeaders(res);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'
    });
    res.end(content);
  } catch (error) {
    json(res, 500, { ok: false, error: '读取页面失败' });
  }
}

async function handleApi(req, res, pathname, searchParams) {
  if (pathname === '/api/health' && req.method === 'GET') {
    json(res, 200, { ok: true, online: true, total: state.bookings.length });
    return;
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    json(res, 200, Object.assign({ ok: true }, sanitizeSettings()));
    return;
  }

  if (pathname === '/api/availability' && req.method === 'GET') {
    const bookings = sortBookings(state.bookings.filter((booking) => booking.status !== 'rejected')).map(sanitizeAvailability);
    json(res, 200, { ok: true, bookings });
    return;
  }

  if (pathname === '/api/bookings' && req.method === 'GET') {
    const clientId = String(searchParams.get('clientId') || '').trim();
    if (!clientId) {
      json(res, 400, { ok: false, error: '缺少 clientId' });
      return;
    }

    const bookings = sortBookings(state.bookings.filter((booking) => booking.clientId === clientId));
    json(res, 200, { ok: true, bookings });
    return;
  }

  if (pathname === '/api/bookings' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
      return;
    }

    const validationError = validateCreatePayload(body);
    if (validationError) {
      const statusCode = validationError.includes('占用') ? 409 : 400;
      json(res, statusCode, { ok: false, error: validationError });
      return;
    }

    const booking = normalizeBooking({
      id: `bk_${randomUUID()}`,
      clientId: body.clientId,
      reason: body.reason,
      date: body.date,
      time: body.time,
      status: 'pending',
      rejectReason: '',
      createdAt: new Date().toISOString()
    });

    state.bookings.push(booking);
    await persistState();
    json(res, 201, { ok: true, booking });
    return;
  }

  if (pathname === '/api/admin/bookings' && req.method === 'GET') {
    if (!isAuthorized(req)) {
      json(res, 401, { ok: false, error: '管理员密码错误' });
      return;
    }

    json(res, 200, { ok: true, bookings: sortBookings(state.bookings) });
    return;
  }

  if (pathname === '/api/admin/settings/disabled-times' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      json(res, 401, { ok: false, error: '管理员密码错误' });
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
      return;
    }

    state.settings.disabledTimes = normalizeDisabledTimes(body.disabledTimes);
    await persistState();
    json(res, 200, Object.assign({ ok: true }, sanitizeSettings()));
    return;
  }

  const acceptMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/accept$/);
  const rejectMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/reject$/);
  const deleteMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);

  if ((acceptMatch || rejectMatch || deleteMatch) && !isAuthorized(req)) {
    json(res, 401, { ok: false, error: '管理员密码错误' });
    return;
  }

  if (acceptMatch && req.method === 'POST') {
    const bookingId = decodeURIComponent(acceptMatch[1]);
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      json(res, 404, { ok: false, error: '预约不存在' });
      return;
    }

    booking.status = 'accepted';
    booking.rejectReason = '';
    await persistState();
    json(res, 200, { ok: true, booking });
    return;
  }

  if (rejectMatch && req.method === 'POST') {
    const bookingId = decodeURIComponent(rejectMatch[1]);
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      json(res, 404, { ok: false, error: '预约不存在' });
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      json(res, 400, { ok: false, error: error.message });
      return;
    }

    const rejectReason = String(body.rejectReason || '').trim();
    if (!rejectReason) {
      json(res, 400, { ok: false, error: '请填写拒绝理由' });
      return;
    }

    booking.status = 'rejected';
    booking.rejectReason = rejectReason;
    await persistState();
    json(res, 200, { ok: true, booking });
    return;
  }

  if (deleteMatch && req.method === 'DELETE') {
    const bookingId = decodeURIComponent(deleteMatch[1]);
    const index = state.bookings.findIndex((item) => item.id === bookingId);
    if (index === -1) {
      json(res, 404, { ok: false, error: '预约不存在' });
      return;
    }

    const [removed] = state.bookings.splice(index, 1);
    await persistState();
    json(res, 200, { ok: true, booking: removed });
    return;
  }

  json(res, 404, { ok: false, error: '接口不存在' });
}

async function requestListener(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, url.searchParams);
      return;
    }

    await serveStatic(res, pathname);
  } catch (error) {
    console.error(error);
    json(res, 500, { ok: false, error: '服务器内部错误' });
  }
}

async function start() {
  await ensureScheduleConfig();
  await ensureState();

  const server = http.createServer((req, res) => {
    requestListener(req, res);
  });

  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
    console.log(`Data file: ${DATA_FILE}`);
    console.log(`Schedule config: ${CONFIG_FILE}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
