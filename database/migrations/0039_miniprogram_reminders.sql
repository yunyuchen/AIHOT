-- "提醒我明天的日报": one row per reminder a mini program reader asked for, holding only what sending that
-- one WeChat subscribe message needs (openid, the daily's date, the template, when it was asked for) and
-- the send state, which carries nothing about the reader. A row is deleted as soon as its send has an
-- outcome, and 48 hours after it was asked for if it never went out (notify/reminders.ts). Not the
-- deliveries table, whose payloads are kept. The daily backup skips this table's data (operations/backup.ts).
CREATE TABLE IF NOT EXISTS miniprogram_reminders (
  id           bigserial PRIMARY KEY,
  openid       text NOT NULL,
  target_date  date NOT NULL,
  template_id  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending')),
  locked_at    timestamptz,
  UNIQUE (openid, target_date)
);
CREATE INDEX IF NOT EXISTS miniprogram_reminders_target_idx ON miniprogram_reminders (target_date, status);
