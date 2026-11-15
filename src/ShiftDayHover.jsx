export default function ShiftDayHover({ preview, position }) {
  if (!preview || !position) return null;

  return <aside role="tooltip" id="schedule-shift-hover-tooltip" className="schedule-shift-hover" style={position} dir="rtl">
    <div className="schedule-shift-hover-heading">
      <strong>{preview.employee}</strong>
      <span>{preview.dayLabel}</span>
    </div>
    <p className="schedule-shift-hover-work">משמרת: <b dir="auto">{preview.shift}</b></p>
    {!preview.hasMail && <p className="schedule-shift-hover-note">כדי לראות פעילויות יש להוסיף את המייל השבועי (PDF, HTML או הדבקה).</p>}
    {preview.warning && <p className="schedule-shift-hover-warning">{preview.warning}</p>}
    {preview.hasMail && preview.mailState !== 'mismatch' && <>
      <p className="schedule-shift-hover-label">פעילויות היום
        <span>{preview.count} אישיות{preview.generalCount ? ' · ' + preview.generalCount + ' כלליות' : ''}</span>
      </p>
      {preview.entries.length ? <div className="schedule-shift-hover-events">
        {preview.entries.map((event) => <div key={event.id} className="schedule-shift-hover-event">
          <time>{event.time || 'ללא שעה'}</time>
          <div className="schedule-shift-hover-event-title">
            <span title={event.title}>{event.title}</span>
            {event.assignment === 'general' && <small>פעילות כללית · לא שויכה לעובד</small>}
          </div>
        </div>)}
      </div> : <p className="schedule-shift-hover-note">לא נמצאו פעילויות המשויכות לעובד ביום הזה במייל.</p>}
      {preview.overflow > 0 && <p className="schedule-shift-hover-more">ועוד {preview.overflow} פעילויות — לחצו לפירוט המלא</p>}
    </>}
    <p className="schedule-shift-hover-foot">לחיצה על התא תפתח את הפירוט המלא</p>
  </aside>;
}
