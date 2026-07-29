# DashDash

אפליקציית Web קטנה ומוכנה ל־Vercel, עם ממשק עברי ומובייל־פרנדלי.

## מה יש באפליקציה

- **TRANSLATE** — קורא טקסט מה־Clipboard, מתקן הקלדה שנעשתה בפריסת עברית/אנגלית לא נכונה, ומעתיק את התוצאה חזרה ל־Clipboard.
  - לדוגמה: `tbh rumv kf,uc` → `אני רוצה לכתוב`
- **זמן אישי** — לחיצה אחת להתחלה ולחיצה שנייה לסיום; מציג זמן חי, סיכום יומי ורשימת ההפעלות האחרונות. אפשר להגדיר כתובת מייל וסף בדקות להתראה אחת אוטומטית, כל עוד האתר פתוח.
- **דף קשקוש** — אזור כתיבה עם שמירה אוטומטית.
- **ציור** — Canvas לעבודה בעכבר או במגע, עם בחירת צבע ועובי עט.
- **BSMART** — פותח כרגע את `https://smartest/`. אפשר לשנות את הכתובת בקבוע `BSMART_URL` שב־`src/App.jsx`.

## שמירת מידע

הטקסט, הזמנים, הגדרות ההתראה והציור נשמרים ב־`localStorage` של הדפדפן בלבד. כתובת המייל נשלחת לשרת **רק** כאשר מגיעים לסף ההתראה, ורק אם התראות המייל הוגדרו ב־Vercel. ניקוי נתוני האתר בדפדפן ימחק את המידע המקומי.

> Clipboard דורש אתר HTTPS והרשאה מהדפדפן. Vercel מספק HTTPS אוטומטית בפריסה.

## הפעלה מקומית

```bash
npm install
npm run dev
```

פתח את הכתובת ש־Vite מציג (לרוב `http://localhost:5173`).

## בדיקות ובניית Production

```bash
npm test
npm run build
```

## הגדרת התראות מייל ב־Gmail

התכונה עובדת בזמן שהאתר פתוח בלבד. המשתמש מזין כתובת יעד וסף דקות; כאשר הטיימר מגיע לסף, DashDash שולח הודעה אחת דרך `/api/send-time-alert`.

1. צור חשבון Gmail ייעודי למשלוח התראות והפעל בו אימות דו־שלבי.
2. צור עבורו **App Password** ב־Google — אין להשתמש בסיסמת ה־Gmail הראשית.
3. ב־Vercel: **Project → Settings → Environment Variables**, הוסף לכל סביבת Production:
   - `GMAIL_SMTP_USER` — כתובת חשבון Gmail השולח.
   - `GMAIL_SMTP_APP_PASSWORD` — ה־App Password של Google.
   - `APP_ORIGIN` — כתובת האתר המלאה בפריסה, למשל `https://your-dashdash-domain.vercel.app`.
   - `MAIL_FROM` — אופציונלי, למשל `DashDash <notifications@example.com>`.
4. פרוס מחדש לאחר שמירת המשתנים.

קיים קובץ `.env.example` עם שמות המשתנים בלבד. **אין** לשמור App Password בקוד, ב־`.env` או ב־GitHub.

## פריסה ל־Vercel

1. העלה את התיקייה ל־GitHub (או יבא אותה ישירות דרך Vercel).
2. ב־Vercel: **Add New → Project** ובחר את המאגר.
3. Vercel יזהה Vite. ההגדרות כבר נמצאות ב־`vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. לחץ **Deploy**.

לאחר הפריסה, פיצ'ר ה־Clipboard יעבוד תחת HTTPS בכפוף לאישור המשתמש בדפדפן.

## מבנה הפרויקט

```text
api/
  send-time-alert.js # Vercel Function ששולחת התראת Gmail
src/
  App.jsx       # ממשק ותכונות האפליקציה
  utils.js      # המרת פריסת מקלדת ועזרי זמן
  styles.css    # עיצוב רספונסיבי
.env.example    # שמות משתני הסביבה הנדרשים להתראות
 tests/
  utils.test.js # בדיקות יחידה
```
