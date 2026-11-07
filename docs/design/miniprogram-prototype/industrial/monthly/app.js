// 栏目色标：行业月刊。四屏：精选、日报、条目详情、锐奇。只读 window.DATA，不编数字。
// 样式只用类选择器：第一个、最后一个这类状态都由这里按下标给修饰类，不用 :first-child、相邻兄弟选择器。
(function () {
  const D = window.DATA;
  const C = D.categoryColors;
  const INK = "#15191d";
  const PAGE = "#ffffff";

  // 栏目色：政策与标准是近黑色，实心色块上配白字；它的书口色标往里收 3px，不和机身黑边连成一片（--dark 修饰类）。
  const color = (key) => C[key] || C.industry;
  const dark = (key) => key === "policy";
  const cv = (key) => `--c:${color(key)}`;
  const mod = (base, key) => (dark(key) ? ` ${base}--dark` : "");

  const ai = (extra = "") =>
    `<span class="ai${extra ? " " + extra : ""}" aria-label="AI 摘要"><span class="ai__a">AI</span><span class="ai__b">摘要</span></span>`;

  const icon = {
    // 精选：一册书，右缘一块色标
    feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="4" y="3.5" width="13" height="17"/><path d="M7.5 8h6M7.5 11.5h6M7.5 15h4"/><rect x="17" y="5.5" width="3" height="6" fill="currentColor" stroke="none"/></svg>',
    daily: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><rect x="7" y="12.5" width="4" height="4" fill="currentColor" stroke="none"/></svg>',
    sports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M2.5 12.5h4.5l2.2-5.5 4.2 11 2.4-5.5h5.7"/></svg>',
    saved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z"/></svg>',
    reechi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M3.5 17a8.5 8.5 0 0 1 17 0"/><path d="M12 17l4.2-5.6"/><path d="M3 20.5h18"/></svg>',
    back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M10 3L5 8l5 5"/></svg>',
    next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M6 3l5 5-5 5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z"/></svg>',
  };
  const ic = (name, cls) => icon[name].replace("<svg ", `<svg class="${cls}" `);

  const tabKeys = ["feed", "daily", "sports", "saved", "reechi"];
  function tabbar(on) {
    return `<nav class="tabs">${D.tabs
      .map((name, i) => `<div class="tab${i === on ? " tab--on" : ""}">${ic(tabKeys[i], "tab__ico")}<span>${esc(name)}</span></div>`)
      .join("")}</nav>`;
  }

  // ---------- 1 精选 ----------
  function feed() {
    const f = D.focus;
    const mast = `
      <header class="mast">
        <div class="mast__row">
          <img class="mast__logo" src="../assets/logo.png" alt="">
          <h1 class="mast__name">${esc(D.appName)}</h1>
        </div>
        <div class="mast__line">${esc(D.nowText)}　第<span class="mast__wk n">${D.isoWeek}</span>周</div>
      </header>`;
    const focus = `
      <div class="band${mod("band", f.category)}" style="${cv(f.category)}">
        <span class="band__name">${esc(f.categoryLabel)}</span>
      </div>
      <section class="focus edge${mod("edge", f.category)}" style="${cv(f.category)}">
        <div class="flagrow"><span class="flag">今日焦点</span>${f.ai ? ai() : ""}</div>
        <h2 class="focus__title">${esc(f.title)}</h2>
        <p class="focus__sum">${esc(f.summary)}</p>
        <div class="focus__src">${f.sourceNames.map(esc).join("、")}</div>
        <div class="focus__foot">
          <div class="stat"><span class="stat__k">来源</span><span class="stat__v"><span class="stat__n n">${f.sourceCount}</span>家</span></div>
          <div class="stat"><span class="stat__k">最新</span><span class="stat__v"><span class="stat__n n">${esc(f.latest)}</span></span></div>
          <div class="btn btn--solid btn--push">读摘要</div>
        </div>
      </section>`;
    const filter = `
      <div class="filter">
        <div class="chip chip--on">全部</div>
        ${D.categories.map((c) => `<div class="chip" style="${cv(c.key)}"><i class="chip__sw"></i>${esc(c.label)}</div>`).join("")}
      </div>`;
    const groups = [];
    for (const card of D.cards) {
      let g = groups.find((x) => x.period === card.period);
      if (!g) groups.push((g = { period: card.period, cards: [] }));
      g.cards.push(card);
    }
    const clock = (t) => t.replace(/^\D+\s*/, "");
    const cards = groups
      .map(
        (g) => `
      <div class="period"><span class="period__name">${esc(g.period)}</span><span class="period__count"><span class="period__n n">${g.cards.length}</span>条</span></div>
      ${g.cards
        .map(
          (c) => `
        <article class="card${mod("card", c.category)}" style="${cv(c.category)}">
          <div class="card__meta"><span class="card__time n">${esc(clock(c.time))}</span>${c.ai ? ai() : ""}<span class="card__cat">${esc(c.categoryLabel)}</span></div>
          <h3 class="card__title">${esc(c.title)}</h3>
          <p class="card__sum">${esc(c.summary)}</p>
          <div class="card__foot"><span>${esc(c.source)}</span>${c.sourceCount >= 2 ? `<span class="card__echo"><span class="card__echo-n n">${c.sourceCount}</span>家在报</span>` : ""}</div>
        </article>`,
        )
        .join("")}`,
      )
      .join("");
    return {
      name: "1 精选：刊名刊头、今日焦点、分类筛选、按时段的精选卡",
      page: PAGE,
      nav: { title: "精选", bg: INK, fg: "#fff" },
      home: "#fff",
      body: mast + focus + filter + cards,
      fixed: tabbar(0),
    };
  }

  // ---------- 2 日报 ----------
  function daily() {
    const d = D.daily;
    const itemCount = d.sections.reduce((n, s) => n + s.items.length, 0);
    const pager = `
      <div class="pager">
        <div class="pager__btn${d.hasPrev ? "" : " pager__btn--off"}">${ic("back", "pager__ico pager__ico--l")}前一天</div>
        <div class="pager__date">${esc(d.dateText)}</div>
        <div class="pager__btn${d.hasNext ? "" : " pager__btn--off"}" aria-disabled="${!d.hasNext}">后一天${ic("next", "pager__ico pager__ico--r")}</div>
      </div>`;
    const cover = `
      <section class="cover">
        <div class="cover__top">
          <div class="cover__day nb">${esc(d.day)}</div>
          <h2 class="cover__name">${esc(d.title)}</h2>
        </div>
        <div class="readings">
          <div class="reading reading--first"><span class="reading__v nb">${d.sections.length}</span><span class="reading__k">个分节</span></div>
          <div class="reading"><span class="reading__v nb">${itemCount}</span><span class="reading__k">条目</span></div>
          <div class="reading"><span class="reading__v nb">${esc(d.publishedAt)}</span><span class="reading__k">出刊</span></div>
        </div>
        <p class="cover__window">收录 ${esc(d.windowText)}</p>
        <div class="actions">
          <div class="btn actions__btn actions__btn--first">${ic("bookmark", "btn__ico")}收藏</div>
          <div class="btn btn--solid actions__btn">分享日报</div>
        </div>
      </section>`;
    // 本期栏目：封面上的目录，每行右缘一条栏目色标，点了跳到对应分节。条数由 sections 数出，不编号。
    const toc = `
      <section class="toc">
        <div class="toc__head"><span class="flag">本期栏目</span></div>
        ${d.sections
          .map((s, i) => {
            const key = s.categories[0];
            return `<div class="toc__row${mod("toc__row", key)}" style="${cv(key)}" data-jump="monthly-sec-${i}"><span class="toc__name">${esc(s.label)}</span><span class="toc__count"><span class="toc__n n">${s.items.length}</span>条</span></div>`;
          })
          .join("")}
      </section>`;
    const lead = `
      <section class="lead">
        <div class="flagrow"><span class="flag">今日头条</span>${ai()}</div>
        <h3 class="lead__title">${esc(d.lead.title)}</h3>
        <p class="lead__text">${esc(d.lead.paragraph)}</p>
      </section>`;
    const sections = d.sections
      .map((s, i) => {
        const key = s.categories[0];
        return `
      <section class="sec${i === 0 ? " sec--first" : ""}" id="monthly-sec-${i}">
        <div class="band${mod("band", key)}" style="${cv(key)}">
          <span class="band__name">${esc(s.label)}</span><span class="band__aside"><span class="band__n n">${s.items.length}</span>条</span>
        </div>
        <div class="edge edge--flush${mod("edge", key)}" style="${cv(key)}">
          ${s.items
            .map(
              (it, j) =>
                `<div class="ditem${j === 0 ? " ditem--first" : ""}"><div class="ditem__title">${esc(it.title)}</div><div class="ditem__src">${esc(it.source)}</div></div>`,
            )
            .join("")}
        </div>
      </section>`;
      })
      .join("");
    const note = `<div class="note">${ai("note__ai")}<p class="note__text">${esc(D.copy.dailyNote)}</p></div><div class="tail"></div>`;
    return {
      name: "2 日报：封面读数、本期栏目目录、今日头条、栏目分节",
      page: PAGE,
      nav: { title: "锐奇微报", bg: INK, fg: "#fff" },
      home: "#fff",
      body: pager + cover + toc + lead + sections + note,
      fixed: tabbar(1),
    };
  }

  // ---------- 3 条目详情 ----------
  function item() {
    const it = D.item;
    const st = it.story;
    const [m, dd] = it.published.split("-").map(Number);
    const body = `
      <div class="band${mod("band", it.category)}" style="${cv(it.category)}">
        <span class="band__name">${esc(it.categoryLabel)}</span>
      </div>
      <article class="art edge${mod("edge", it.category)}" style="${cv(it.category)}">
        ${ai()}
        <h2 class="art__title">${esc(it.title)}</h2>
        <div class="art__meta"><span>${esc(it.source)}</span><span class="art__date">${m}月${dd}日发布</span></div>
        <p class="art__sum">${esc(it.summary)}</p>
        <div class="art__why">
          <div class="blk__head"><span class="blk__name">为什么值得看</span>${ai()}</div>
          <p class="blk__text">${esc(it.reason)}</p>
        </div>
      </article>
      <section class="blk">
        <div class="blk__head"><span class="blk__name">来源</span></div>
        <div class="srcrow"><span class="srcrow__name">${esc(it.source)}</span><span class="srcrow__date">${m}月${dd}日</span></div>
        <div class="btn btn--block">复制来源链接</div>
        <p class="fine">${esc(D.copy.summaryOnly)}</p>
      </section>
      <section class="blk">
        <div class="blk__head"><span class="blk__name">同一事件</span></div>
        <div class="story">
          <div class="story__main">
            <div class="story__title">${esc(st.title)}</div>
            <div class="story__count"><span class="story__n n">${st.sourceCount}</span>家来源</div>
            <div class="story__others">另有 ${st.otherSourceNames.map(esc).join("、")}</div>
          </div>
          ${ic("chevron", "story__go")}
        </div>
      </section>`;
    const bar = `
      <div class="bar">
        <div class="btn bar__save">${ic("bookmark", "btn__ico")}收藏</div>
        <div class="btn btn--solid bar__share">分享给同事</div>
      </div>`;
    return {
      name: "3 条目详情：顶部栏目色带，色标沿正文右缘，底部操作条",
      page: PAGE,
      nav: { title: "条目详情", bg: INK, fg: "#fff", back: true },
      body,
      fixed: bar,
      clearance: 112,
    };
  }

  // ---------- 4 锐奇 ----------
  function reechi() {
    const R = D.reechi;
    const key = "inspection";
    const isPlaceholder = (v) => /^\[.*\]$/.test(v || "");
    // 图注：名称和“图片来源：……”两段，用全角空格隔开，单独一行。
    const fig = (img, src, extra) => {
      const [name, from] = img.caption.split(" · ");
      return `
      <figure class="fig${extra ? " " + extra : ""}">
        <img class="fig__img" src="${esc(src)}" alt="${esc(name)}">
        <figcaption class="fig__cap"><span class="fig__name">${esc(name)}</span>　<span class="fig__src">图片来源：${esc(from)}</span></figcaption>
      </figure>`;
    };
    const prod = (p, i) => `
      <div class="prod${i === 0 ? " prod--first" : ""}" style="${cv(key)}">
        <h3 class="prod__name">${esc(p.name)}</h3>
        <p class="prod__text">${esc(p.text)}</p>
      </div>`;
    const contactRow = (c, i, all) => {
      const off = isPlaceholder(c.value);
      const isNum = c.action === "call" && !off;
      return `
        <div class="row${i === all.length - 1 ? " row--last" : ""}">
          <div class="row__main">
            <div class="row__k">${esc(c.label)}</div>
            <div class="row__v${isNum ? " row__v--num n" : ""}${off ? " row__v--off" : ""}">${esc(c.value)}</div>
            ${c.note ? `<div class="row__sub">${esc(c.note)}</div>` : ""}
          </div>
          <div class="btn btn--row${off ? " btn--off" : ""}"${off ? ' aria-disabled="true"' : ""}>${c.action === "call" ? "拨打" : "复制"}</div>
        </div>`;
    };
    const docs = ["关于锐奇微报", "用户协议", "隐私说明"];
    // 两张官网图都不压在产品名前面：一体机那张放在介绍下面，涂布线那张放进“关于锐奇”讲极片涂布的第二段后面。
    const body = `
      <section class="intro">
        <img class="intro__logo" src="../assets/logo-large.png" alt="">
        <h2 class="intro__name">${esc(R.name)}</h2>
        <p class="intro__lead">${esc(R.lead)}</p>
        <div class="btn btn--solid btn--inline">联系我们</div>
      </section>
      ${fig(R.images[0], "gauge-wide.jpg", "fig--hero")}
      <h2 class="h2">产品与应用</h2>
      <div class="prods">${R.products.map(prod).join("")}</div>
      <h2 class="h2">关于锐奇</h2>
      <p class="para para--first">${esc(R.about[0])}</p>
      <p class="para">${esc(R.about[1])}</p>
      ${fig(R.images[1], "../" + R.images[1].src)}
      <p class="para para--after-fig">${esc(R.about[2])}</p>
      <h2 class="h2">联系我们</h2>
      <div class="rows">${R.contacts.map(contactRow).join("")}</div>
      <h2 class="h2">文档</h2>
      <div class="rows">
        ${docs.map((t, i) => `<div class="doc${i === docs.length - 1 ? " doc--last" : ""}">${esc(t)}${ic("chevron", "doc__ico")}</div>`).join("")}
      </div>
      <h2 class="h2">反馈与侵权投诉</h2>
      <p class="para para--first">${esc(R.feedbackIntro)}</p>
      <div class="rows">${R.feedback.map(contactRow).join("")}</div>
      <h2 class="h2">声明</h2>
      <p class="small small--first">${esc(R.statement)}</p>
      <p class="small">${esc(R.accessLog)}</p>
      <div class="tail"></div>`;
    return {
      name: "4 锐奇：产品右缘贴检测栏目色标，官网图带来源图注",
      page: PAGE,
      nav: { title: "锐奇", bg: INK, fg: "#fff" },
      home: "#fff",
      body,
      fixed: tabbar(4),
    };
  }

  Shell.mount({
    title: "栏目色标：行业月刊",
    sub: "像《高工锂电》这类行业月刊，每个栏目有自己的颜色。分类色升级成栏目色：日报封面有“本期栏目”目录，每个分节用整宽栏目色带开头、色标沿右缘延续到分节结束；精选卡和条目页右缘贴同一种色标。导航、刊头、tabBar 是墨底白字，其余黑白。",
    screens: [feed(), daily(), item(), reechi()],
  });

  // 原型里点“本期栏目”的一行，滚到对应分节（小程序里用 Taro.pageScrollTo({ selector })）。
  document.addEventListener("click", (e) => {
    const row = e.target.closest("[data-jump]");
    const body = row && row.closest(".phone__body");
    const target = body && body.querySelector("#" + row.dataset.jump);
    if (target) body.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  });
})();
