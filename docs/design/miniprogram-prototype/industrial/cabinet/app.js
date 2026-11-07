// 机柜灰 · 设备期刊：四屏，全部取 window.DATA 的真实数据。派生值只有日期、周次、条数、来源数、时刻。
(function () {
  const D = window.DATA;
  const A = "../";
  const color = (key) => D.categoryColors[key] || D.categoryColors.industry;

  // ---------- 小零件 ----------
  const ind = (key) => `<i class="ind" style="background:${color(key)}"></i>`;
  const cat = (key, label) => `<span class="cat">${ind(key)}${esc(label)}</span>`;
  const ai = () => `<span class="ai" aria-label="AI 摘要"><span class="ai__a">AI</span><span class="ai__b">摘要</span></span>`;
  // 铭牌：name 是面板名；field 是铭牌第二格（DIN 读数）；lamp 为真时左边亮灯；catKey 给分类铭牌加方形指示灯（装在白色小窗里）。
  function plate(name, { field, lamp, catKey } = {}) {
    return `<span class="plate">${lamp ? '<i class="lamp"></i>' : ""}${catKey ? `<span class="plate__win">${ind(catKey)}</span>` : ""}${esc(name)}${
      field ? `<span class="plate__f">${esc(field)}</span>` : ""
    }</span>`;
  }
  const svg = (cls, d, vb = 24) => `<svg class="${cls}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true">${d}</svg>`;
  const I = {
    right: svg("ico ico--s", '<path d="M6 3.5L10.5 8 6 12.5"/>', 16),
    left: svg("ico ico--s", '<path d="M10 3.5L5.5 8 10 12.5"/>', 16),
    bookmark: svg("ico", '<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>'),
    share: svg("ico", '<path d="M12 3.5v11"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M5 12v8.5h14V12"/>'),
    copy: svg("ico", '<path d="M8.5 8.5h11v11h-11z"/><path d="M15.5 8.5v-4h-11v11h4"/>'),
  };
  const TAB_ICONS = {
    // 精选：三块上下叠放的横长面板，像机柜里一层层的面板；日报保留折页报纸，两者不再都是“文档形状”。
    精选: '<path d="M3.5 3.5h17v4h-17zM3.5 10h17v4h-17zM3.5 16.5h17v4h-17z"/>',
    日报: '<path d="M3.5 5h13v14.5h-13z"/><path d="M16.5 9h4v10.5h-4"/><path d="M6.5 8.5h7M6.5 12h7M6.5 15.5h4"/>',
    运动健康: '<path d="M2.5 12.5h4.5l2.5-6 4.5 11 2.5-5h5"/>',
    收藏: '<path d="M6 3.5h12v17l-6-4.5-6 4.5z"/>',
    锐奇: '<path d="M3.5 17a8.5 8.5 0 0 1 17 0"/><path d="M12 17l4.5-5.5"/><path d="M2.5 20.5h19"/>',
  };
  function tabBar(active) {
    return `<nav class="tabs">${D.tabs
      .map(
        (t) => `<div class="tab${t === active ? " tab--on" : ""}"><i class="tab__lamp"></i>${svg("tab__ico", TAB_ICONS[t])}<span class="tab__label">${esc(t)}</span></div>`,
      )
      .join("")}</nav>`;
  }
  const clock = (time) => String(time).replace(/^昨天\s*/, "");
  const md = (iso) => `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
  const yesterday = (() => {
    const d = new Date(new Date(D.now).getTime() - 864e5 + 8 * 3600e3);
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  })();

  // ---------- 1 精选 ----------
  function card(c, first) {
    const echo = c.sourceCount >= 2 ? `<span class="card__echo"><span class="din">${c.sourceCount}</span>家在报</span>` : "";
    return `<article class="card${first ? " card--first" : ""}">
      <div class="card__meta"><span class="card__time">${esc(clock(c.time))}</span>${cat(c.category, c.categoryLabel)}<span class="grow"></span>${c.ai ? ai() : ""}</div>
      <h3 class="card__title">${esc(c.title)}</h3>
      <p class="card__sum">${esc(c.summary)}</p>
      <div class="card__foot"><span>${esc(c.source)}</span>${echo}</div>
    </article>`;
  }
  function feed() {
    const f = D.focus;
    // 时段分组：今天按凌晨/上午/下午/晚间，往日按天；今天最新的一段亮灯。
    const RANGE = { 凌晨: "0–6 时", 上午: "6–12 时", 下午: "12–18 时", 晚间: "18 时以后" };
    const groups = [];
    for (const c of D.cards) {
      let g = groups.find((x) => x.period === c.period);
      if (!g) groups.push((g = { period: c.period, cards: [] }));
      g.cards.push(c);
    }
    const today = groups.filter((g) => RANGE[g.period]);
    const lit = today[0];
    const groupsHtml = groups
      .map((g) => {
        const name = RANGE[g.period] ? `${g.period} ${RANGE[g.period]}` : g.period === "昨天" ? `昨天 ${yesterday}` : g.period;
        return `<section class="panel panel--list">
          <div class="head head--stick">${plate(name, { lamp: g === lit, field: `${g.cards.length} 条` })}</div>
          ${g.cards.map((c, i) => card(c, i === 0)).join("")}
        </section>`;
      })
      .join("");
    const sources = (f.sourceNames && f.sourceNames.length ? f.sourceNames : [f.source]).join("、");
    return `<div class="cab">
      <header class="mast">
        <img class="mast__logo" src="${A}assets/logo.png" alt="">
        <div class="mast__name">${esc(D.appName)}</div>
        <div class="mast__read">
          <div class="mast__date">${esc(D.nowText)}</div>
          <div class="mast__week">第 ${D.isoWeek} 周</div>
        </div>
      </header>
      <section class="panel focus">
        <div class="head">${plate("今日焦点")}<span class="grow"></span>${cat(f.category, f.categoryLabel)}${f.ai ? ai() : ""}</div>
        <h2 class="focus__title">${esc(f.title)}</h2>
        <p class="focus__sum">${esc(f.summary)}</p>
        <p class="focus__src">${esc(sources)}</p>
        <div class="spec">
          <div class="spec__cell"><div class="spec__k">来源</div><div class="spec__v">${f.sourceCount}<span class="spec__u">家</span></div></div>
          <div class="spec__cell spec__cell--line"><div class="spec__k"><i class="lamp lamp--seat"></i>最新</div><div class="spec__v">${esc(f.latest)}</div></div>
          <div class="spec__key">读摘要</div>
        </div>
      </section>
      <div class="filter"><div class="filter__row">
        <span class="chip chip--on">全部</span>
        ${D.categories.map((c) => `<span class="chip">${ind(c.key)}${esc(c.label)}</span>`).join("")}
      </div></div>
      ${groupsHtml}
    </div>`;
  }

  // ---------- 2 日报 ----------
  function daily() {
    const d = D.daily;
    const itemCount = d.sections.reduce((n, s) => n + s.items.length, 0);
    const keyOf = (s) => s.categories[0];
    // 分节头照旧带 AI 摘要标记（用户协议：日报在头条卡和每个分节标题旁标）。data.js 没带条目的 ai 字段，
    // daily.json 里 24 条的 ai.title 全是 true，所以这里每个分节都标；落地时按 section.ai 判断。
    const sections = d.sections
      .map(
        (s) => `<section class="panel panel--list">
          <div class="head head--stick">${plate(s.label, { catKey: keyOf(s) })}<span class="grow"></span>${s.ai === false ? "" : ai()}<span class="sec__count">${s.items.length} 条</span></div>
          ${s.items
            .map(
              (it, i) => `<div class="entry${i === 0 ? " entry--first" : ""}"><div class="entry__title">${esc(it.title)}</div><div class="entry__src">${esc(it.source)}</div></div>`,
            )
            .join("")}
        </section>`,
      )
      .join("");
    return `<div class="cab">
      <div class="pager">
        <span class="pager__btn">${I.left}前一天</span>
        <span class="pager__date">${esc(d.dateText)}</span>
        <span class="pager__btn${d.hasNext ? "" : " pager__btn--off"}" aria-disabled="${!d.hasNext}">后一天${I.right}</span>
      </div>
      <section class="panel issue">
        <div class="head">${plate("本期", { field: `第 ${D.isoWeek} 周` })}</div>
        <div class="issue__row">
          <div>
            <div class="issue__title">${esc(d.title)}</div>
            <div class="issue__window">${esc(d.windowText)}</div>
          </div>
          <div class="issue__day">${esc(d.day)}</div>
        </div>
        <div class="spec spec--even">
          <div class="spec__cell"><div class="spec__k">分节</div><div class="spec__v">${d.sections.length}</div></div>
          <div class="spec__cell spec__cell--line"><div class="spec__k">条目</div><div class="spec__v">${itemCount}</div></div>
          <div class="spec__cell spec__cell--line"><div class="spec__k">出刊</div><div class="spec__v">${esc(d.publishedAt)}</div></div>
        </div>
      </section>
      <section class="panel">
        <div class="head">${plate("本期头条")}<span class="grow"></span>${ai()}</div>
        <h2 class="lead__title">${esc(d.lead.title)}</h2>
        <p class="lead__text">${esc(d.lead.paragraph)}</p>
        <div class="acts">
          <span class="btn">${I.bookmark}收藏</span>
          <span class="btn btn--solid btn--wide">${I.share}分享日报</span>
        </div>
      </section>
      ${sections}
      <div class="foot-note">${ai()}<span>${esc(D.copy.dailyNote)}</span></div>
    </div>`;
  }

  // ---------- 3 条目详情 ----------
  function item() {
    const it = D.item;
    const st = it.story;
    // 和 lib/item.ts 一样：其他来源最多列 3 个，还有没列出来的加“等”。
    const more = st.sourceCount - 1 > st.otherSourceNames.length ? "等" : "";
    const others = st.otherSourceNames.join("、") + more;
    return `<div class="cab">
      <section class="panel">
        <div class="head">${plate(it.categoryLabel, { catKey: it.category })}<span class="grow"></span>${ai()}</div>
        <h2 class="art__title">${esc(it.title)}</h2>
        <div class="art__by"><span class="art__src">${esc(it.source)}</span><span class="art__date">${esc(it.published)}</span></div>
        <p class="art__sum">${esc(it.summary)}</p>
      </section>
      <section class="panel">
        <div class="head">${plate("为什么值得看")}<span class="grow"></span>${ai()}</div>
        <p class="why__text">${esc(it.reason)}</p>
      </section>
      <section class="panel">
        <div class="head">${plate("来源")}</div>
        <div class="src__row"><span class="src__name">${esc(it.source)}</span><span class="src__date">${esc(it.published)}</span></div>
        <span class="btn btn--block src__btn">${I.copy}复制来源链接</span>
        <p class="small">${esc(D.copy.summaryOnly)}</p>
      </section>
      <section class="panel story">
        <div class="head">${plate("同一事件", { field: `${st.sourceCount} 家来源` })}</div>
        <h3 class="story__title">${esc(st.title)}</h3>
        ${others ? `<p class="story__others">${esc(others)}</p>` : ""}
        <div class="story__go"><span>查看事件进展</span>${I.right}</div>
      </section>
    </div>`;
  }
  const itemBar = `<div class="bar"><span class="btn btn--ondark">${I.bookmark}收藏</span><span class="btn btn--light btn--wide">${I.share}分享给同事</span></div>`;

  // ---------- 4 锐奇 ----------
  function reechi() {
    const r = D.reechi;
    const todo = (v) => /^\[.*\]$/.test(String(v).trim());
    const fig = (img, photo) => {
      const [name, from] = img.caption.split(" · ");
      return `<figure class="fig"><img class="fig__img${photo ? " fig__img--photo" : ""}" src="${A}${img.src}" alt="${esc(name)}">
        <figcaption class="fig__cap"><span class="fig__name">${esc(name)}</span><span>图片来源：${esc(from || "")}</span></figcaption></figure>`;
    };
    const prod = (p, i) => {
      const at = p.text.indexOf("：");
      const text = at > 0 ? `<span class="prod__use">${esc(p.text.slice(0, at + 1))}</span>${esc(p.text.slice(at + 1))}` : esc(p.text);
      return `<div class="prod${i === 0 ? " prod--first" : ""}"><div class="prod__name">${esc(p.name)}</div><p class="prod__text">${text}</p></div>`;
    };
    const kv = (c, i) => {
      const off = todo(c.value);
      const num = c.action === "call" && !off;
      const label = c.action === "call" ? "拨打" : "复制";
      const btn = off ? `<span class="btn btn--off" aria-disabled="true">${label}</span>` : `<span class="btn${c.action === "call" ? " btn--solid" : ""}">${label}</span>`;
      return `<div class="kv${i === 0 ? " kv--first" : ""}"><div class="kv__body"><div class="kv__k">${esc(c.label)}</div><div class="kv__v${num ? " kv__v--num" : ""}${off ? " kv__v--todo" : ""}">${esc(c.value)}</div>${
        c.note ? `<div class="kv__note">${esc(c.note)}</div>` : ""
      }</div>${btn}</div>`;
    };
    return `<div class="cab">
      <header class="hero">
        <div class="hero__id"><img class="hero__logo" src="${A}assets/logo-large.png" alt=""><div class="hero__name">${esc(r.name)}</div></div>
        <p class="hero__lead">${esc(r.lead)}</p>
        <span class="btn btn--light">联系我们</span>
      </header>
      <section class="panel">
        <div class="head">${plate("产品与应用")}</div>
        ${fig(r.images[0])}
        ${r.products.map(prod).join("")}
        ${fig(r.images[1], true)}
      </section>
      <section class="panel">
        <div class="head">${plate("关于锐奇")}</div>
        ${r.about.map((p, i) => `<p class="about${i === 0 ? " about--first" : ""}">${esc(p)}</p>`).join("")}
      </section>
      <section class="panel">
        <div class="head">${plate("联系我们")}</div>
        ${r.contacts.map(kv).join("")}
      </section>
      <section class="panel">
        <div class="head">${plate("文档")}</div>
        ${["关于锐奇微报", "用户协议", "隐私说明"].map((t, i) => `<div class="doc${i === 0 ? " doc--first" : ""}">${t}${I.right}</div>`).join("")}
      </section>
      <section class="panel">
        <div class="head">${plate("反馈与侵权投诉")}</div>
        <p class="intro">${esc(r.feedbackIntro)}</p>
        ${r.feedback.map(kv).join("")}
      </section>
      <section class="panel">
        <div class="head">${plate("声明")}</div>
        <p class="legal legal--first">${esc(r.statement)}</p>
        <p class="legal">${esc(r.accessLog)}</p>
      </section>
    </div>`;
  }

  const NAV = { bg: "#353b3f", fg: "#fff" };
  const PAGE = "#d3d6d2";
  Shell.mount({
    title: "机柜灰 · 设备期刊",
    sub: "产线控制柜的浅灰做底，每块内容是一块白面板，面板左上角挂炭灰铭牌写面板名；信号黄的小灯只标“现在在哪”：选中的 tab、今天最新的时段、事件的最新报道。",
    screens: [
      { name: "精选", page: PAGE, home: "#fff", nav: { ...NAV, title: "精选" }, body: feed(), fixed: tabBar("精选"), clearance: 102 },
      { name: "日报", page: PAGE, home: "#fff", nav: { ...NAV, title: "锐奇微报" }, body: daily(), fixed: tabBar("日报"), clearance: 102 },
      { name: "条目详情", page: PAGE, home: "#fff", nav: { ...NAV, title: "条目详情", back: true }, body: item(), fixed: itemBar, clearance: 102 },
      { name: "锐奇", page: PAGE, home: "#fff", nav: { ...NAV, title: "锐奇" }, body: reechi(), fixed: tabBar("锐奇"), clearance: 102 },
    ],
  });
})();
