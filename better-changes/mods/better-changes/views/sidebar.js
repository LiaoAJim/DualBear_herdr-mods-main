// The sidebar: its tabs, options menu, file groups and commit views.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, setShared } from "herdr";
import { fileTree, timeAgo } from "../git/model.js";
import {
  TEXT,
  SPIN_MS,
  codeFont,
  FileIcon,
  Chevron,
  Panel,
  PanelHeader,
  HeaderTab,
  IconButton,
  TextButton,
  GroupHeader,
  Row,
  DiffStat,
  StatusLetter,
  Message,
  Menu,
  MenuLabel,
  MenuDivider,
  MenuOption,
  TextBox,
  SplitButton,
  SplitTrigger,
} from "./ui.js";

const VIEWS = [
  { id: "flat", label: "Flat", icon: "flat" },
  { id: "tree", label: "Tree", icon: "tree" },
];
const LAYOUTS = [
  { id: "inline", label: "Inline", icon: "diff-inline" },
  { id: "split", label: "Side by side", icon: "diff-split" },
];

export const sidebarMethods = {
  // ── Preferences ───────────────────────────────────────────────────────────

  setTab(tab, cx) {
    this.tab = tab;
    localStorage.setItem("tab", tab);
    if (tab === "commit") this.loadCommits(cx);
    cx.notify();
  },

  setView(view, cx) {
    this.view = view;
    localStorage.setItem("view", view);
    cx.notify();
  },

  toggleGroup(scope, cx) {
    if (!this.collapsed.delete(scope)) this.collapsed.add(scope);
    localStorage.setItem("collapsed", JSON.stringify([...this.collapsed]));
    cx.notify();
  },

  setDiffLayout(style, cx) {
    this.diffLayout = style;
    localStorage.setItem("diff-layout", style);
    setShared("better-changes.diff-layout", style);
    cx.notify();
  },

  // ── Sidebar ───────────────────────────────────────────────────────────────

  render() {
    if (this.mode === "panel-key") return div();
    if (this.mode === "pane-header") return this.renderPaneHeader();
    if (this.mode === "diff") return this.renderDiff();
    if (this.selectedCommit) {
      return Panel({ id: "better-changes" })
        .child(this.renderHeader())
        .child(this.renderCommit());
    }
    return Panel({ id: "better-changes" })
      .on_mouse_move((e, cx) => this.onDragMouseMove(e, cx))
      .on_mouse_up("left", (_e, cx) => this.stopDrag(cx))
      .child(this.renderHeader())
      .child(this.renderChanges())
      .child(this.renderCommitsAccordion());
  },

  renderHeader() {
    return PanelHeader()
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .items_center()
          .child(
            div()
              .font_bold()
              .text_size(TEXT.body ?? 13)
              .text_color(theme().foreground)
              .child("Source Control"),
          ),
      )
      .child(
        IconButton({
          id: "refresh",
          icon: "refresh",
          label: "Refresh",
          spinning: this.refreshSpinning,
          onClick: (cx) => this.refreshAll(cx),
        }),
      )
      .child(this.renderMore());
  },

  toggleCommitsSection(cx) {
    this.commitsSectionCollapsed = !this.commitsSectionCollapsed;
    localStorage.setItem("better-changes.commits-section-collapsed", this.commitsSectionCollapsed ? "1" : "0");
    if (!this.commitsSectionCollapsed) this.loadCommits(cx);
    cx.notify();
  },

  cycleCommitsHeight(cx) {
    const current = this.commitsSectionHeight || 200;
    let next = 200;
    if (current <= 160) next = 260;
    else if (current <= 280) next = 380;
    else next = 150;
    this.commitsSectionHeight = next;
    localStorage.setItem("better-changes.commits-section-height", String(next));
    cx.notify();
  },

  renderCommitsAccordion() {
    const t = theme();
    const isCollapsed = Boolean(this.commitsSectionCollapsed);
    const height = this.commitsSectionHeight || 200;
    const count = this.commits?.length ? `${this.commits.length}` : "";

    return v_flex()
      .id("commits-accordion")
      .flex_none()
      .border_t(1)
      .border_color(t.border)
      .child(
        // Drag Resizing Splitter Bar for Commits section
        h_flex()
          .id("commits-drag-handle")
          .h(6)
          .w_full()
          .cursor_row_resize()
          .items_center()
          .justify_center()
          .when(Boolean(this.draggingCommits), (el) => el.bg(t.accent ?? t.hover))
          .hover((el) => el.bg(t.accent ?? t.hover))
          .on_mouse_down("left", (e, cx) => this.startDragCommits(e, cx))
          .child(
            div()
              .w(24)
              .h(2)
              .rounded(1)
              .bg(t.dim),
          ),
      )
      .child(
        h_flex()
          .id("commits-accordion-header")
          .px(10)
          .py(4)
          .items_center()
          .justify_between()
          .bg(t.raised ?? t.surface)
          .cursor_pointer()
          .on_click((_e, cx) => this.toggleCommitsSection(cx))
          .child(
            h_flex()
              .items_center()
              .gap(6)
              .child(
                div()
                  .text_size(TEXT.caption)
                  .text_color(t.dim)
                  .child(isCollapsed ? "▶" : "▼"),
              )
              .child(
                div()
                  .text_size(TEXT.small)
                  .font_bold()
                  .text_color(t.foreground)
                  .child("Commits (Graph / History)"),
              )
              .when(Boolean(count), (el) =>
                el.child(
                  div()
                    .px(5)
                    .py(1)
                    .rounded(10)
                    .bg(t.hover)
                    .text_size(TEXT.badge ?? 10)
                    .text_color(t.dim)
                    .child(count),
                ),
              ),
          )
          .child(
            div()
              .text_size(TEXT.caption)
              .text_color(t.dim)
              .child(isCollapsed ? "folded" : `${height}px`),
          ),
      )
      .when(!isCollapsed, (box) =>
        box
          .h(height)
          .flex_none()
          .min_h(80)
          .child(this.renderHistory()),
      );
  },

  refreshAll(cx) {
    this.refresh(cx);
    if (this.tab === "commit") this.loadCommits(cx);
    if (this.refreshSpinning) return;
    this.refreshSpinning = true;
    cx.notify();
    cx.timer.after(SPIN_MS, (cx) => this.stopSpinningWhenRead(cx));
  },

  // Git usually answers at once, so the icon always makes a full turn to be seen.
  stopSpinningWhenRead(cx) {
    if (this.loading || this.commitsLoading) {
      cx.timer.after(SPIN_MS, (cx) => this.stopSpinningWhenRead(cx));
      return;
    }
    this.refreshSpinning = false;
    cx.notify();
  },

  renderMore() {
    const option = (group, choice, selected, set) =>
      MenuOption({
        id: `${group}-${choice.id}`,
        icon: choice.icon,
        label: choice.label,
        selected,
        onClick: (cx) => {
          this.menuOpen = false;
          set(choice.id, cx);
          cx.notify();
        },
      });
    return Menu({
      id: "more",
      open: this.menuOpen,
      focus: this.menuFocus,
      onOpenChange: (open, cx) => {
        this.menuOpen = open;
        cx.notify();
      },
      trigger: IconButton({ id: "more-trigger", icon: "more", label: "Options" }),
      children: [
        MenuLabel("Changes"),
        ...VIEWS.map((v) =>
          option("view", v, this.view === v.id, (id, cx) => this.setView(id, cx)),
        ),
        MenuDivider(),
        MenuLabel("Diff"),
        ...LAYOUTS.map((l) =>
          option("layout", l, this.diffLayout === l.id, (id, cx) => this.setDiffLayout(id, cx)),
        ),
      ],
    });
  },

  // ── Drag Resizing ────────────────────────────────────────────────────────
  startDragCommitBox(e, cx) {
    this.draggingCommitBox = true;
    this.dragStartY = e.position.y;
    this.dragStartHeight = this.commitBoxHeight || 140;
    cx.stop_propagation();
  },

  onDragMouseMove(e, cx) {
    if (this.draggingCommitBox) {
      // Commit box is at the top now: dragging down increases height
      const deltaY = e.position.y - this.dragStartY;
      const newHeight = Math.max(80, Math.min(500, Math.round(this.dragStartHeight + deltaY)));
      if (newHeight !== this.commitBoxHeight) {
        this.commitBoxHeight = newHeight;
        localStorage.setItem("better-changes.commit-height", String(newHeight));
        cx.notify();
      }
    }
    if (this.draggingCommits) {
      const deltaY = this.dragCommitsStartY - e.position.y; // Dragging up increases height
      const newHeight = Math.max(90, Math.min(650, Math.round(this.dragCommitsStartHeight + deltaY)));
      if (newHeight !== this.commitsSectionHeight) {
        this.commitsSectionHeight = newHeight;
        localStorage.setItem("better-changes.commits-section-height", String(newHeight));
        cx.notify();
      }
    }
  },

  stopDrag(cx) {
    if (this.draggingCommitBox || this.draggingCommits) {
      this.draggingCommitBox = false;
      this.draggingCommits = false;
      cx.notify();
    }
  },

  startDragCommits(e, cx) {
    this.draggingCommits = true;
    this.dragCommitsStartY = e.position.y;
    this.dragCommitsStartHeight = this.commitsSectionHeight || 200;
    cx.stop_propagation();
  },

  cycleCommitBoxHeight(cx) {
    // Cycle between compact (110px), medium (175px), large (250px)
    const current = this.commitBoxHeight || 140;
    let next = 140;
    if (current <= 120) next = 175;
    else if (current <= 180) next = 250;
    else next = 110;
    this.commitBoxHeight = next;
    localStorage.setItem("better-changes.commit-height", String(next));
    cx.notify();
  },

  renderBranchCard(t) {
    const branch = this.branch ?? "HEAD";
    const repo = this.repo ?? "";
    const isMain = ["main", "master"].includes(branch);
    const prData = (shared("branch-pr.status") ?? {})[branch];
    const prNumber = prData?.number ? `#${prData.number}` : null;
    const prTitle = prData?.title ?? null;
    const prState = prData?.state ?? (isMain ? "main branch" : "local branch");

    return v_flex()
      .id("branch-pr-card")
      .flex_none()
      .px(10)
      .py(6)
      .border_b(1)
      .border_color(t.border)
      .bg(t.raised ?? t.surface)
      .child(
        h_flex()
          .items_center()
          .justify_between()
          .gap(6)
          .child(
            h_flex()
              .flex_1()
              .min_w(0)
              .items_center()
              .gap(6)
              .child(
                div()
                  .text_color(isMain ? t.dim : t.ansi2)
                  .child("🌿"),
              )
              .child(
                div()
                  .truncate()
                  .font_bold()
                  .text_size(TEXT.small)
                  .text_color(t.foreground)
                  .child(branch),
              ),
          )
          .child(
            h_flex()
              .flex_none()
              .items_center()
              .gap(4)
              .when(Boolean(prNumber), (el) =>
                el.child(
                  div()
                    .px(5)
                    .py(1)
                    .rounded(4)
                    .bg(t.selection ?? t.hover)
                    .text_size(TEXT.caption)
                    .text_color(t.ansi4)
                    .child(prNumber),
                ),
              )
              .child(
                div()
                  .px(5)
                  .py(1)
                  .rounded(4)
                  .bg(t.hover)
                  .text_size(TEXT.caption)
                  .text_color(isMain ? t.dim : t.ansi2)
                  .child(prState),
              ),
          ),
      )
      .when(Boolean(prTitle), (el) =>
        el.child(
          div()
            .truncate()
            .text_size(TEXT.caption)
            .text_color(t.dim)
            .child(prTitle),
        ),
      );
  },

  renderChanges() {
    const t = theme();
    const list = v_flex().id("changes-list").flex_1().min_h(0).overflow_y_scrollbar().p(6);
    if (this.error) return list.child(Message(this.error, true));
    const conflicts = this.files.filter((f) => f.conflict);
    const unstaged = this.files.filter((f) => f.unstaged && !f.conflict);
    const staged = this.files.filter((f) => f.staged);
    const committed = this.committed?.total ? this.committed : null;
    if (!conflicts.length && !unstaged.length && !staged.length && !committed)
      list.child(Message(this.loading || !this.root ? "Loading changes…" : "No changes"));
    this.groupsDrawn = 0;
    this.addGroup(list, "conflict", "Conflicts", conflicts);
    this.addGroup(list, "staged", "Staged", staged);
    this.addGroup(list, "unstaged", "Unstaged", unstaged);
    if (committed)
      this.addGroup(
        list,
        "committed",
        "Committed",
        committed.files,
        `not on ${committed.name}`,
        committed.total,
      );
    const limit = this.settings.limits.files;
    if (this.total > limit)
      list.child(Message(`Showing the first ${limit.toLocaleString()} changed files.`));

    return v_flex()
      .id("changes")
      .flex_1()
      .min_h(0)
      .child(this.renderBranchCard(t))
      .child(this.renderCommitBox())
      .child(list);
  },

  renderCommitBox() {
    const t = theme();
    const hint = this.commitBoxHint();
    const isCollapsed = Boolean(this.commitBoxCollapsed);
    const height = Math.max(120, this.commitBoxHeight || 165);

    return v_flex()
      .id("commit-box")
      .flex_none()
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id("commit-box-header")
          .px(10)
          .py(3)
          .items_center()
          .justify_between()
          .bg(t.raised ?? t.surface)
          .cursor_pointer()
          .on_click((_e, cx) => this.toggleCommitBox(cx))
          .child(
            h_flex()
              .items_center()
              .gap(6)
              .child(
                div()
                  .text_size(TEXT.caption)
                  .text_color(t.dim)
                  .child(isCollapsed ? "▶" : "▼"),
              )
              .child(
                div()
                  .text_size(TEXT.caption)
                  .font_bold()
                  .text_color(t.dim)
                  .child("Commit Message"),
              ),
          )
          .child(
            div()
              .text_size(TEXT.caption)
              .text_color(t.dim)
              .child(isCollapsed ? "folded" : `${height}px`),
          ),
      )
      .when(!isCollapsed, (box) =>
        box
          .px(10)
          .pt(8)
          .pb(6)
          .gap(6)
          .min_h(height)
          .when(Boolean(this.note), (el) =>
            el.child(
              div()
                .text_size(TEXT.small)
                .text_color(t.ansi1)
                .whitespace_normal()
                .child(this.note ?? ""),
            ),
          )
          .child(
            TextBox({
              id: "commit-message",
              state: this.input,
              focused: this.typing,
              label: "Commit message",
            }),
          )
          .child(this.renderCommitButton())
          .when(Boolean(hint), (el) =>
            el.child(
              div()
                .text_size(TEXT.caption)
                .text_color(this.commitMode === "amend" ? t.working : t.dim)
                .whitespace_normal()
                .child(hint ?? ""),
            ),
          ),
      )
      .when(!isCollapsed, (box) =>
        box.child(
          // Drag Resizing Splitter Bar at bottom of commit box (above unstaged list)
          h_flex()
            .id("commit-drag-handle")
            .h(6)
            .w_full()
            .cursor_row_resize()
            .items_center()
            .justify_center()
            .when(Boolean(this.draggingCommitBox), (el) => el.bg(t.accent ?? t.hover))
            .hover((el) => el.bg(t.accent ?? t.hover))
            .on_mouse_down("left", (e, cx) => this.startDragCommitBox(e, cx))
            .child(
              div()
                .w(24)
                .h(2)
                .rounded(1)
                .bg(t.dim),
            ),
        ),
      );
  },

  commitBoxHint() {
    if (this.amendLoading) return "Loading the latest commit…";
    if (this.conflicts) return "Resolve conflicts and stage the files before committing.";
    if (this.commitMode === "amend") {
      return "Amend rewrites the latest commit. Unstaged changes stay untouched.";
    }
    return null;
  },

  commitButtonLabel() {
    if (this.operation === "commit") return "Committing…";
    if (this.operation === "amend") return "Amending…";
    return this.commitMode === "amend" ? "Amend" : "Commit";
  },

  renderCommitButton() {
    const amend = this.commitMode === "amend";
    return SplitButton({
      id: "commit",
      icon: amend ? "amend" : "commit",
      label: this.commitButtonLabel(),
      enabled: this.canCommit(),
      primary: !amend,
      onClick: (cx) => this.commit(cx),
      menu: this.renderCommitMenu(),
    });
  },

  renderCommitMenu() {
    const amend = this.commitMode === "amend";
    const choose = (mode) => (cx) => this.setCommitMode(mode, cx);
    const options = [
      MenuOption({
        id: "mode-commit",
        icon: "commit",
        label: "Commit",
        selected: !amend,
        onClick: choose("commit"),
      }),
    ];
    if (this.hasHead) {
      options.push(
        MenuOption({
          id: "mode-amend",
          icon: "amend",
          label: "Amend",
          selected: amend,
          onClick: choose("amend"),
        }),
      );
    }
    return Menu({
      id: "commit-menu",
      open: this.commitMenuOpen,
      focus: this.commitMenuFocus,
      anchor: "bottom_right",
      onOpenChange: (open, cx) => {
        this.commitMenuOpen = open;
        cx.notify();
      },
      trigger: SplitTrigger({ id: "commit-options", label: "Commit options" }),
      children: options,
    });
  },

  addGroup(list, scope, label, files, detail, count = files.length) {
    if (!files.length) return;
    const collapsed = this.collapsed.has(scope);
    const bulk = {
      unstaged: { action: "stage", icon: "plus", label: "Stage all" },
      staged: { action: "unstage", icon: "minus", label: "Unstage all" },
    }[scope];
    list.child(
      GroupHeader({
        id: `group-${scope}`,
        label,
        count,
        detail,
        danger: scope === "conflict",
        collapsed,
        divided: this.groupsDrawn++ > 0,
        action:
          bulk &&
          TextButton({
            id: `${bulk.action}-all`,
            icon: bulk.icon,
            label: bulk.label,
            onClick: (cx) => this.indexAction(bulk.action, null, cx),
          }),
        onClick: (cx) => this.toggleGroup(scope, cx),
      }),
    );
    if (collapsed) return;
    this.addRows(list, scope, files);
  },

  // A group's files, flat or nested as chosen in the options menu.
  addRows(list, scope, files) {
    if (this.view === "flat") {
      for (const file of files) list.child(this.fileRow(file, scope, 0));
      return;
    }
    const closed = new Set(
      [...this.closed]
        .filter((key) => key.startsWith(`${scope}:`))
        .map((key) => key.slice(scope.length + 1)),
    );
    for (const row of fileTree(files, closed))
      list.child(
        row.kind === "folder"
          ? this.folderRow(row, scope, closed.has(row.path))
          : this.fileRow(row.file, scope, row.depth),
      );
  },

  folderRow(row, scope, closed) {
    const t = theme();
    const key = `${scope}:${row.path}`;
    return Row({
      id: `folder-${key}`,
      depth: row.depth,
      stem: !closed,
      onClick: (cx) => {
        if (closed) this.closed.delete(key);
        else this.closed.add(key);
        cx.notify();
      },
    })
      .child(Chevron(!closed))
      .when(Boolean(this.fileIcons), (el) =>
        el.child(FileIcon({ icons: this.fileIcons, path: `${this.root}/${row.path}`, dir: true, open: !closed, t })),
      )
      .child(div().flex_1().min_w(0).truncate().child(row.name));
  },

  fileRow(file, scope, depth) {
    const t = theme();
    const parts = file.path.split("/");
    const name = parts.pop();
    const tree = this.view === "tree";
    const stats =
      scope === "staged" ? file.stagedStats : scope === "unstaged" ? file.unstagedStats : file;
    const status =
      scope === "staged"
        ? file.stagedStatus
        : scope === "unstaged"
          ? file.unstagedStatus
          : file.status;
    const open = shared("better-changes.selection");
    const row = Row({
      id: `file-${scope}-${file.path}`,
      depth,
      selected: open?.path === file.path && open?.scope === scope,
      onClick: (cx) => this.pick(file, scope, cx),
    }).child(FileIcon({ icons: this.fileIcons, path: `${this.root}/${file.path}`, color: t.muted, t }));
    if (tree) row.child(div().flex_1().min_w(0).truncate().child(name));
    else
      row.child(
        h_flex()
          .flex_1()
          .min_w(0)
          .gap(6)
          .items_center()
          .child(div().max_w(190).flex_none().truncate().child(name))
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(TEXT.small)
              .text_color(t.dim)
              .child(parts.join("/")),
          ),
      );
    if (file.conflict)
      row.child(
        div().flex_none().text_size(TEXT.caption).text_color(t.ansi1).child(file.conflictKind),
      );
    else row.child(DiffStat(stats)).child(StatusLetter(status));
    if (scope === "unstaged")
      row.child(
        IconButton({
          id: `stage-${file.path}`,
          icon: "plus",
          label: "Stage",
          small: true,
          onClick: (cx) => this.indexAction("stage", file.path, cx),
        }),
      );
    if (scope === "staged")
      row.child(
        IconButton({
          id: `unstage-${file.path}`,
          icon: "minus",
          label: "Unstage",
          small: true,
          onClick: (cx) => this.indexAction("unstage", file.path, cx),
        }),
      );
    return row;
  },

  renderHistory() {
    const list = v_flex().id("commit-list").flex_1().min_h(0).overflow_y_scrollbar().p(6);
    if (this.commitsError) return list.child(Message(this.commitsError, true));
    if (!this.commits.length)
      return list.child(
        Message(this.commitsLoading || !this.root ? "Loading history…" : "No commits yet"),
      );
    this.groupsDrawn = 0;
    const remote = this.committed;
    const more = this.commitsDone ? "" : "+";
    const local = this.branch ?? "HEAD";
    if (!remote) {
      this.addCommits(list, {
        scope: "branch",
        label: local,
        count: `${this.commits.length}${more}`,
        commits: this.commits,
        withMore: true,
      });
      return list;
    }
    const notPulled = (n) => (n ? `${n} not pulled` : null);
    const detail = (...parts) => parts.filter(Boolean).join(" · ");
    const head = this.remoteHead;
    const pushed = this.commits.filter((c) => !remote.unpushed.has(c.hash));
    this.addCommits(list, {
      scope: "branch",
      label: local,
      count: remote.unpushed.size,
      commits: this.commits.filter((c) => remote.unpushed.has(c.hash)),
    });
    if (head && head.target !== remote.name) {
      // A feature branch: what the remote branch has, then the default branch under it.
      const onBranch = pushed.filter((c) => head.ahead.has(c.hash));
      const onDefault = pushed.filter((c) => !head.ahead.has(c.hash));
      this.addCommits(list, {
        scope: "remote",
        label: remote.name,
        count: onBranch.length,
        commits: onBranch,
        detail: notPulled(this.behind),
      });
      this.addCommits(list, {
        scope: "default",
        label: head.name,
        count: `${onDefault.length}${more}`,
        commits: onDefault,
        detail: detail(head.target, notPulled(head.behind)),
        withMore: true,
      });
      return list;
    }
    this.addCommits(list, {
      scope: "remote",
      label: remote.name,
      count: `${pushed.length}${more}`,
      commits: pushed,
      detail: detail(head?.name, notPulled(this.behind)),
      withMore: true,
    });
    return list;
  },

  addCommits(list, { scope, label, count, commits, detail, withMore = false }) {
    if (!commits.length) return;
    const t = theme();
    const collapsed = this.collapsed.has(scope);
    list.child(
      GroupHeader({
        id: `group-${scope}`,
        label,
        count,
        detail,
        collapsed,
        divided: this.groupsDrawn++ > 0,
        onClick: (cx) => this.toggleGroup(scope, cx),
      }),
    );
    if (collapsed) return;
    for (const commit of commits) list.child(this.commitRow(commit));
    if (withMore && !this.commitsDone)
      list.child(
        Row({ id: "commits-more", onClick: (cx) => this.loadCommits(cx, true) })
          .justify_center()
          .text_size(TEXT.small)
          .text_color(t.muted)
          .child(this.commitsLoading ? "Loading…" : "Load more"),
      );
  },

  commitRow(commit) {
    const t = theme();
    return h_flex()
      .id(`commit-${commit.hash}`)
      .flex_none()
      .px(8)
      .py(6)
      .gap(8)
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.openCommit(commit, cx))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(1)
          .child(div().truncate().child(commit.subject))
          .child(
            div()
              .truncate()
              .text_size(TEXT.caption)
              .text_color(t.dim)
              .child(`${commit.author} · ${timeAgo(commit.at)}`),
          ),
      )
      .child(
        div()
          .flex_none()
          .text_size(TEXT.caption)
          .text_color(t.dim)
          .font_family(codeFont())
          .child(commit.short),
      );
  },

  renderCommit() {
    return v_flex()
      .id("commit-detail")
      .flex_1()
      .min_h(0)
      .child(this.renderCommitTopRow())
      .child(
        v_flex()
          .id("commit-scroll")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .child(this.renderCommitAbout())
          .child(this.renderCommitChanges()),
      );
  },

  // Only a commit the remote has can be opened there.
  commitUrl(commit) {
    if (!this.repo || this.committed?.unpushed.has(commit.hash)) return null;
    return `https://github.com/${this.repo}/commit/${commit.hash}`;
  },

  renderCommitTopRow() {
    const t = theme();
    const commit = this.selectedCommit;
    const url = this.commitUrl(commit);
    const row = PanelHeader()
      .px(8)
      .gap(4)
      .child(
        IconButton({
          id: "commit-back",
          icon: "chevron-left",
          label: "Back to commits",
          onClick: (cx) => {
            this.selectedCommit = null;
            this.commitToken++;
            cx.notify();
          },
        }),
      )
      .child(
        div()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(TEXT.small)
          .text_color(t.dim)
          .font_family(codeFont())
          .child(commit.short),
      );
    if (url) {
      row.child(
        IconButton({
          id: "commit-open",
          icon: "external-link",
          label: "Open on GitHub",
          onClick: (cx) => cx.open_url(url),
        }),
      );
    }
    return row;
  },

  renderCommitAbout() {
    const t = theme();
    const commit = this.selectedCommit;
    const when = new Date(commit.at * 1000).toLocaleString();
    const about = v_flex()
      .id("commit-about")
      .flex_none()
      .px(14)
      .py(10)
      .gap(4)
      .border_b(1)
      .border_color(t.border)
      .child(div().font_medium().whitespace_normal().child(commit.subject))
      .child(
        div()
          .text_size(TEXT.caption)
          .text_color(t.dim)
          .whitespace_normal()
          .child(`${commit.author} · ${when}`),
      );
    if (commit.body) {
      about.child(
        div()
          .pt(6)
          .text_size(TEXT.small)
          .text_color(t.muted)
          .whitespace_normal()
          .child(commit.body),
      );
    }
    return about;
  },

  renderCommitChanges() {
    const changes = v_flex().id("commit-changes").flex_none().p(6);
    if (this.commitFilesError) return changes.child(Message(this.commitFilesError, true));
    if (this.commitFilesLoading) return changes.child(Message("Loading changes…"));
    if (this.commitFiles.length) {
      changes.child(
        GroupHeader({ id: "group-commit", label: "Changes", count: this.commitFiles.length }),
      );
    }
    this.addRows(changes, "commit", this.commitFiles);
    return changes;
  },
};
