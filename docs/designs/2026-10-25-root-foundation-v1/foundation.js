/* Standalone visual draft. No App imports, account state, network or backend. */
const pages = [
  { id: 'together', title: '同行', icon: 'people', caption: '人物与意愿，保留自己的内容节奏' },
  { id: 'plans', title: '计划', icon: 'checkCircle', caption: '日期在左，整卡进入时间表' },
  { id: 'calendar', title: '日历', icon: 'calendar', caption: '视图与工具归位，时间网格为主' },
  { id: 'messages', title: '消息', icon: 'messages', caption: '搜索、快捷入口与会话清楚分层' },
  { id: 'me', title: '我', icon: 'person', caption: '身份先行，设置按内容分组' },
];
const paths = {
  people: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="6.5" r="3.5"/><path d="M17 3.3a3.5 3.5 0 0 1 0 6.6M22 20v-2a4 4 0 0 0-3-3.9"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7 5.5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h.01M12 14h.01M17 14h.01M7 17.5h.01M12 17.5h.01"/>',
  messages: '<path d="M14 15H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2"/><path d="M21 11v10l-3-2h-6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2Z"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.7 7.4M3 4v7h7M12 7v5l3 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  schedule: '<path d="M20 9V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h4M7 1v4m9-4v4M3 8h17"/><circle cx="17" cy="17" r="5"/><path d="M17 14v3l2 1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  greeting: '<path d="M4 19v-8a1.5 1.5 0 0 1 3 0V7a1.5 1.5 0 0 1 3 0V5a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0v7l1.5-2a1.7 1.7 0 0 1 2.5 2.3L16 20a6 6 0 0 1-10 0Z"/>',
  link: '<path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4A8.7 8.7 0 0 0 12 3Z"/><path d="M7 10h.01M10 6.5h.01M15 7h.01" stroke-width="3"/>',
  sparkles: '<path d="m13 3 2.5 7 6.5 2-6.5 2-2.5 7-2.5-7L4 12l6.5-2L13 3ZM4 2v4M2 4h4"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  book: '<path d="M5 3h14v18H6a3 3 0 0 1 0-6h13M5 3v12"/>',
  language: '<path d="M4 4h16v13h-6l-5 4v-4H4V4Z"/><path d="M8 8h8m-4-2v2m-3 0c0 3 4 6 6 6m0-6c0 3-4 6-6 6"/>',
  privacy: '<path d="M6 11h12v10H6V11ZM8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v2"/>',
  gear: '<path d="m9 3-1 3-3 1v4l-2 1 2 4 3-1 2 3h4l1-3 3-1v-4l2-1-2-4-3 1-2-3H9Z"/><circle cx="11" cy="10.5" r="3"/>',
};
function icon(name, size = 22, extra = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths[name] || paths.person}</svg>`;
}
function avatar(id, label = '', cls = '') { return `<img class="avatar ${cls}" src="assets/${id}.svg" alt="${label}">`; }
function avatarStack(ids) { return `<span class="avatar-stack" aria-label="参与者头像">${ids.map(id => avatar(id)).join('')}</span>`; }
function header(page) {
  return `<div class="statusbar"><span class="status-time">9:41</span><span class="status-icons"><svg width="17" height="13" viewBox="0 0 17 13" fill="currentColor" aria-hidden="true"><rect y="8" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="8" rx="1"/><rect x="9" y="2" width="3" height="11" rx="1"/><rect x="13.5" width="3" height="13" rx="1"/></svg><svg width="18" height="14" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 4a13 13 0 0 1 16 0M5 8a8 8 0 0 1 10 0m-7 4a3 3 0 0 1 4 0"/><circle cx="10" cy="14" r=".8" fill="currentColor" stroke="none"/></svg><svg width="26" height="14" viewBox="0 0 28 15" aria-hidden="true"><rect x=".6" y="1" width="23.5" height="13" rx="3" stroke="currentColor" stroke-opacity=".45" fill="none"/><rect x="3" y="3.3" width="18.5" height="8.4" rx="1.5" fill="currentColor"/><path d="M26 5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></div>
    <header class="root-header"><div class="header-slot">${page.id === 'plans' ? icon('history', 23) : ''}</div><div class="brand-title"><img src="assets/brand.png" alt=""><h1>${page.title}</h1></div><div class="header-slot">${page.id === 'messages' ? icon('schedule', 23) : ''}</div></header>`;
}
function tabs(names, selected, equal = true) { return `<div class="section-tabs ${equal ? 'equal' : ''}">${names.map((name, i) => `<span class="section-tab ${i === selected ? 'active' : ''}">${name}</span>`).join('')}</div>`; }
function bottomNavigation(active) {
  return `<footer class="bottom-navigation"><nav class="tabbar" aria-label="底部主导航">${pages.map(page => `<a class="tab-item ${page.id === active ? 'active' : ''}" href="?view=single&page=${page.id}" ${page.id === active ? 'aria-current="page"' : ''}>${icon(page.icon, 25)}<span>${page.title}</span></a>`).join('')}</nav><div class="home-indicator"></div></footer>`;
}
function section(title, count = '', trailing = '') { return `<div class="section-heading"><h2>${title}</h2>${count ? `<span class="count">${count}</span>` : ''}${trailing ? `<span class="trailing">${trailing}</span>` : ''}</div>`; }
function personCard(name, image, school, activity, time, location, badge) {
  return `<article class="card person-card"><div class="person-top">${avatar(image, name)}<div class="person-identity"><strong>${name}</strong><small>${school}</small></div><span class="soft-label">${badge}</span></div><h3>${activity}</h3><div class="detail-line">${icon('clock', 15)}<span>${time}</span></div><div class="detail-line">${icon('pin', 15)}<span>${location}</span></div><div class="person-actions"><span class="compatibility">空闲时间合适</span><div style="display:flex;gap:4px;align-items:center"><span class="icon-action" aria-label="收藏">${icon('bookmark', 20)}</span><span class="pill-action">${icon('messages', 16)}打个招呼</span></div></div></article>`;
}
function together() {
  return `<div class="root-controls">${tabs(['我的意愿', '推荐', '我的收藏'], 1)}</div><div class="scroll-content">${section('发现合拍的同行', '', '根据你的意愿推荐')}${personCard('小羽', 'p08', 'TUM · 信息工程', '一起去图书馆自习', '周二 14:00–17:00', '主图书馆', '学习')}${personCard('Mina', 'p14', 'LMU · 传播学', '周末逛逛美术馆', '周六 13:00–17:00', '现代艺术陈列馆', '看展')}${personCard('阿泽', 'p17', 'TUM · 机械工程', '傍晚一起去跑步', '周三 17:30–18:30', '英国花园', '运动')}</div>`;
}
function planCard({days, title, state, progress, known = '', people = []}) {
  return `<article class="card plan-card" aria-label="${title}，${state}，整卡进入计划"><div class="schedule"><div class="month">10月${known ? ' · 周三' : ''}</div><div class="days">${days}<em>日</em></div><div class="time ${known ? 'known' : ''}">${known || '7天可选 · 时间待定'}</div></div><div class="plan-info"><h3>${title}</h3><div class="status">${state}</div><div class="plan-footer"><span>${progress}</span>${people.length ? avatarStack(people) : ''}<span class="entry-chevron">${icon('chevron', 15)}</span></div></div></article>`;
}
function plans() {
  return `<div class="root-controls">${tabs(['筹划中', '已确定'], 0)}</div><div class="scroll-content plans-content">${section('需要你处理', '2')}${planCard({days:'25–31', title:'周末聚餐', state:'待你选空闲', progress:'0人已填写'})}${planCard({days:'25–31', title:'图书馆自习', state:'待你确定时间', progress:'4人已填写', people:['p08','p14','p17']})}<section class="waiting-section">${section('等待其他人', '2')}<div class="horizontal-rail">${planCard({days:'28', title:'下午喝杯咖啡', state:'等待大家回复', progress:'2人已填写', known:'15:00–16:00', people:['p08','p14']})}${planCard({days:'25–31', title:'周末一起看展', state:'收集空闲', progress:'3人已填写', people:['p14','p17']})}</div></section></div><div class="create-dock"><span class="pill-action create-plan">${icon('plus', 20)}发起计划</span></div>`;
}
function calendar() {
  const weekdays = ['一','二','三','四','五','六','日'];
  const dates = ['26','27','28','29','30','31','1'];
  const hours = Array.from({length: 10}, (_, i) => `<span class="hour" style="top:${i * 48}px">${9 + i}:00</span>`).join('');
  return `<div class="root-controls"><div class="calendar-tools"><span class="month-label">2026年10月 ${icon('down', 14)}</span><div class="tool-group"><span class="icon-action" aria-label="搜索">${icon('search', 20)}</span><span class="icon-action" aria-label="连接日历">${icon('link', 20)}</span><span class="icon-action" aria-label="分类">${icon('filter', 22)}</span></div></div><div class="calendar-views">${tabs(['月','周','日'], 1)}<span class="icon-action" aria-label="新增">${icon('plus', 22)}</span></div></div><div class="scroll-content calendar-scroll"><div class="card week-card"><div class="week-header"><span></span>${weekdays.map((d,i) => `<div class="weekday ${i === 0 ? 'selected' : ''}"><small>周${d}</small><strong>${dates[i]}</strong></div>`).join('')}</div><div class="week-grid">${hours}<div class="calendar-event blue" style="left:2px;top:49px;height:71px">算法<small>10:00</small></div><div class="calendar-event sage" style="left:calc(100% / 7 + 2px);top:241px;height:71px">图书馆<small>14:00</small></div><div class="calendar-event oat" style="left:calc(100% / 7 * 2 + 2px);top:145px;height:47px">午餐<small>12:00</small></div><div class="calendar-event lavender" style="left:calc(100% / 7 * 3 + 2px);top:289px;height:71px">复习<small>15:00</small></div></div></div><div class="calendar-legend"><span><i style="background:#b6c6de"></i>课程</span><span><i style="background:#bccaa7"></i>计划</span><span><i style="background:#d8caab"></i>个人</span></div></div>`;
}
function conversation(name, image, time, message, unread = '') {
  return `<article class="conversation">${avatar(image, name)}<div class="conversation-text"><div class="conversation-heading"><strong>${name}</strong><time>${time}</time></div><div class="conversation-preview"><p>${message}</p>${unread ? `<span class="unread">${unread}</span>` : ''}</div></div></article>`;
}
function messages() {
  return `<div class="root-controls"><div class="search-control">${icon('search', 18)}搜索联系人或消息</div></div><div class="scroll-content messages-content"><div class="card message-shortcuts"><div class="shortcut"><span class="shortcut-icon">${icon('greeting', 22)}</span><div class="shortcut-copy"><strong>新招呼</strong><small>2个新招呼</small></div></div><div class="shortcut"><span class="shortcut-icon">${icon('bell', 22)}</span><div class="shortcut-copy"><strong>通知</strong><small>1条未读</small></div></div></div>${section('最近会话')}<div class="card conversations">${conversation('Mina','p14','09:32','我把周末的空闲时间填好啦','2')}${conversation('小羽','p08','08:46','好呀，我们图书馆见！')}${conversation('阿泽','p17','昨天','[计划] 傍晚一起去跑步')}${conversation('Lin','p11','昨天','谢谢推荐，下次一起去')}${conversation('小可','p03','周五','周末有空再联系～')}</div></div>`;
}
function management(title, rows) {
  return `<section class="management-section"><h2 class="management-heading">${title}</h2><div class="card management-group">${rows.map(([label, symbol, value]) => `<div class="management-row"><span class="row-icon">${icon(symbol, 21)}</span><span class="row-label">${label}</span>${value ? `<span class="row-value">${value}</span>` : ''}<span class="chevron">${icon('chevron', 13)}</span></div>`).join('')}</div></section>`;
}
function me() {
  return `<div class="scroll-content me-content"><section class="card profile-card">${avatar('p03','晓禾')}<div class="profile-copy"><h2>晓禾</h2><p>TUM · 计算机科学</p><span class="verified">${icon('shield',12)}学生身份已认证</span></div><span class="muted">${icon('chevron',16)}</span></section>${management('个性化', [['主题、图标与资料样式','palette']])}${management('会员', [['会员','sparkles','免费版']])}${management('校园', [['认证','shield','已认证'], ['课程','book'], ['语言','language','中文 · English']])}${management('隐私与安全', [['隐私','privacy']])}${management('设置', [['设置','gear']])}</div>`;
}
const content = { together, plans, calendar, messages, me };
function phone(id, large = false) {
  const page = pages.find(page => page.id === id) || pages[1];
  return `<section class="phone ${large ? 'large' : ''}" data-page="${page.id}" aria-label="${page.title}一级页面设计稿">${header(page)}<div class="root-body">${content[page.id]()}</div>${bottomNavigation(page.id)}</section>`;
}
function board() {
  return `<div class="board"><div class="board-heading"><div><p class="eyebrow">SIDESEAT / ROOT FOUNDATION 01</p><h1>五个入口，一套清楚、稳定的底板</h1></div><p class="board-subtitle">统一抬头、边距、层级与底部导航<br>保留每页自己的功能结构 · 本地设计稿，待确认</p></div><div class="phone-row">${pages.map(page => `<div class="phone-column">${phone(page.id)}<div class="page-caption"><strong>${page.title}</strong><span>${page.caption}</span></div></div>`).join('')}</div><p class="board-footer">428 × 926 视觉参考 · 页面内容为演示数据 · 未修改现有 App 或手机 Preview</p></div>`;
}
function foundation() {
  const notes = [
    ['固定抬头', '五页品牌、标题与高度一致。左右各保留 44 的工具位，工具数量不影响标题居中。'],
    ['按需使用的二级导航', '分栏沿用轻下划线；搜索、日历视图与个人资料保留自己的结构。没有分栏的页面直接进入内容。'],
    ['同一套内容材料', '左右边距 20，暖白背景、纯白卡片。通过留白和文字大小区分层级，图标与状态不再套一圈边框。'],
    ['主操作按功能出现', '计划页的「发起计划」保留在右下，与列表内容分开；其他页面沿用现有操作位置。'],
    ['固定的五入口底栏', '五等分点击区、统一选中底色与安全区。列表在底栏之上滚动，末项可完整出现。'],
  ];
  return `<div class="anatomy"><p class="eyebrow">SIDESEAT / SHARED FOUNDATION</p><h1>固定的是骨架，内容各有自己的节奏</h1><div class="anatomy-layout"><section class="phone" data-page="foundation">${header({id:'foundation',title:'页面标题'})}<div class="root-body"><div class="root-controls">${tabs(['当前分栏','其他分栏'],0)}</div><div class="skeleton-stage"><div class="card skeleton-card"><span class="skeleton-line short"></span><span class="skeleton-line"></span><span class="skeleton-line" style="width:60%"></span></div><div class="card skeleton-card"><span class="skeleton-line short"></span><span class="skeleton-line"></span><span class="skeleton-line" style="width:60%"></span></div><p class="skeleton-label">独立滚动的页面内容</p></div><div class="create-dock"><span class="pill-action create-plan">${icon('plus',20)}页面主操作</span></div></div>${bottomNavigation('plans')}</section><div class="anatomy-notes">${notes.map(([title,text],i) => `<section class="note-group"><span class="note-num">0${i+1}</span><div><h2>${title}</h2><p>${text}</p></div></section>`).join('')}<div class="swatches"><span class="swatch"><i style="background:#f7f7f3"></i>画布</span><span class="swatch"><i style="background:#fff"></i>内容</span><span class="swatch"><i style="background:#26322d"></i>主操作</span><span class="swatch"><i style="background:#edefe8"></i>选中</span></div><p class="board-footer">本地浏览器原型，非真机截图。此轮仅保存设计底板，不覆盖 App。</p></div></div></div>`;
}
const query = new URLSearchParams(location.search);
const view = query.get('view') || 'board';
const page = query.get('page') || 'plans';
document.querySelector('#app').innerHTML = view === 'single' ? `<div class="single">${phone(page, query.get('size') === 'large')}</div>` : view === 'foundation' ? foundation() : board();
