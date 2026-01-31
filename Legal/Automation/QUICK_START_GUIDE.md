# Google Workspace Legal Automation - Quick Start Guide

## 30-Minute Setup Checklist

**Goal:** Get NDA automation working in 30 minutes
**Prerequisites:** Google Workspace account (goodflippinvibes.com or goodflippindesign.com)

---

## ⏱️ PHASE 1: GOOGLE DRIVE SETUP (5 minutes)

### Step 1: Create Folder Structure

1. Go to **drive.google.com**
2. Create these folders (exact names):

```
📁 Legal
  ├─📁 Templates
  ├─📁 Master-Database
  ├─📁 Executed-Documents
  └─📁 Archive
```

3. **CRITICAL**: Note the Folder IDs:
   - Open each folder
   - Copy ID from URL: `https://drive.google.com/drive/folders/[THIS_IS_THE_ID]`
   - Save to notepad:
     ```
     Templates: 1A2B3C4D...
     Master-Database: 5E6F7G8H...
     Executed-Documents: 9I0J1K2L...
     Archive: 3M4N5O6P...
     ```

---

## ⏱️ PHASE 2: CREATE NDA TEMPLATE (5 minutes)

### Step 2: Create Google Doc Template

1. **Open file:** `z:\Good Flippin Design\Legal\Templates\Google-Docs\Mutual-NDA-Template.md`
2. **Copy all text** (Ctrl+A, Ctrl+C)
3. **Create new Google Doc:** docs.google.com → Blank document
4. **Paste** content
5. **Format**:
   - Title: "MUTUAL NON-DISCLOSURE AGREEMENT" (bold, 18pt)
   - Section headings: Bold, 14pt
   - Keep {{MERGE_FIELDS}} exactly as written
6. **Save as:** "Mutual-NDA-Template"
7. **Move to:** Legal/Templates folder
8. **Note Template ID** from URL: `https://docs.google.com/document/d/[THIS_IS_TEMPLATE_ID]/edit`

---

## ⏱️ PHASE 3: CREATE MASTER DATABASE (5 minutes)

### Step 3: Create Google Sheet

1. **New Google Sheet:** sheets.google.com → Blank
2. **Rename sheet:** "NDA-Requests"
3. **Add column headers** (Row 1):
   ```
   A: Timestamp
   B: Document ID
   C: Requester Name
   D: Requester Email
   E: Company
   F: NDA Type
   G: Purpose
   H: Document Link
   I: PDF Link
   J: Status
   K: Generated Date
   L: Archived Date
   M: Emailed To
   ```
4. **Format header row:** Bold, background color (light gray)
5. **Save as:** "NDA-Requests"
6. **Move to:** Legal/Master-Database folder
7. **Note Sheet ID** from URL: `https://docs.google.com/spreadsheets/d/[THIS_IS_SHEET_ID]/edit`

---

## ⏱️ PHASE 4: CREATE GOOGLE FORM (5 minutes)

### Step 4: Create Form

1. **New Form:** forms.google.com → Blank form
2. **Title:** "Request Non-Disclosure Agreement"
3. **Description:** "Complete this form to generate an NDA for review and signature. You'll receive the document via email within minutes."

4. **Add questions:**

   **Question 1:** Your Name
   - Type: Short answer
   - Required: Yes

   **Question 2:** Your Email
   - Type: Email
   - Required: Yes
   - Validation: Valid email

   **Question 3:** Company/Organization
   - Type: Short answer
   - Required: Yes

   **Question 4:** NDA Type
   - Type: Multiple choice
   - Required: Yes
   - Options:
     - Mutual (both parties share confidential info)
     - One-Way (only I share confidential info)

   **Question 5:** Purpose of NDA
   - Type: Paragraph
   - Required: Yes
   - Description: "Example: Exploring partnership for web development project"

   **Question 6:** Additional Notes
   - Type: Paragraph
   - Required: No

5. **Settings:**
   - ✓ Collect email addresses
   - ✓ Limit to 1 response

6. **Link to Sheet:**
   - Click "Responses" tab
   - Click green Sheets icon
   - Select "Select existing spreadsheet"
   - Choose "NDA-Requests" sheet created in Step 3
   - Click "Select"

7. **Get Form URL:**
   - Click "Send" button (top right)
   - Click link icon
   - Click "Shorten URL" checkbox
   - **Copy URL:** `https://forms.gle/a1B2c3D4...`
   - Save to notepad

---

## ⏱️ PHASE 5: APPS SCRIPT AUTOMATION (10 minutes)

### Step 5: Install Automation Script

1. **Open NDA-Requests Sheet** from Step 3
2. **Extensions → Apps Script**
3. **Delete default code** (select all, delete)
4. **Open file:** `z:\Good Flippin Design\Legal\Automation\GOOGLE_WORKSPACE_AUTOMATION_GUIDE.md`
5. **Find:** "Script 1: NDA Automation" (around line 450)
6. **Copy entire script** (from `// NDA Request Automation` to end of script)
7. **Paste** into Apps Script editor
8. **Update CONFIG section** (lines 8-25):

   ```javascript
   const CONFIG = {
     TEMPLATE_FOLDER_ID: "PASTE_YOUR_TEMPLATES_FOLDER_ID",
     EXECUTED_FOLDER_ID: "PASTE_YOUR_EXECUTED_FOLDER_ID",
     ARCHIVE_FOLDER_ID: "PASTE_YOUR_ARCHIVE_FOLDER_ID",
     MUTUAL_NDA_TEMPLATE_ID: "PASTE_YOUR_TEMPLATE_DOC_ID",
     ONEWAY_NDA_TEMPLATE_ID: "PASTE_YOUR_TEMPLATE_DOC_ID", // Use same for now
     EMAIL_RECIPIENTS: [
       "getsome@goodflippindesign.com",
       "getsome@goodflippinvibes.com",
       "brett.l.weaver@gmail.com",
     ],
     COMPANY_NAME: "GFV LLC DBA Good Flippin Design",
     COMPANY_ADDRESS: "Minneapolis, MN",
     COMPANY_REP: "Brett Weaver",
   };
   ```

9. **Save:** Ctrl+S or File → Save
10. **Name project:** "NDA Automation"

### Step 6: Create Trigger

1. **Click clock icon** (left sidebar - "Triggers")
2. **Add Trigger** (bottom right)
3. **Settings:**
   - Function: `onFormSubmit`
   - Event source: From spreadsheet
   - Event type: On form submit
4. **Save**
5. **Authorize:**
   - Click "Advanced"
   - Click "Go to NDA Automation (unsafe)"
   - Click "Allow"
   - (This grants script permission to access Drive, Gmail, etc.)

---

## ⏱️ TEST THE SYSTEM (5 minutes)

### Step 7: Submit Test Form

1. **Open your form:** Use the forms.gle link from Step 4
2. **Fill out form** with test data:
   - Name: Test User
   - Email: YOUR_EMAIL@gmail.com
   - Company: Test Company
   - NDA Type: Mutual
   - Purpose: Testing automation system
3. **Submit**
4. **Wait 30-60 seconds**

### Step 8: Verify Results

**Check 1: Master Sheet Updated**

- Open NDA-Requests Sheet
- Row 2 should have:
  - Timestamp
  - Document ID (NDA-2026-001)
  - Your test data
  - Status: "Archived"

**Check 2: Document Generated**

- Open Legal/Executed-Documents folder
- Should see: `NDA-2026-001_Test_User.docx`
- Open document
- Verify merge fields replaced with your data

**Check 3: PDF Created**

- Should see: `NDA-2026-001.pdf`

**Check 4: Archive Copy**

- Open Legal/Archive folder
- Should see: `NDA-2026-001_ARCHIVED.pdf`

**Check 5: Emails Sent**

- Check inbox for all 3 email addresses
- Should receive email with:
  - Subject: "NDA Generated: NDA-2026-001"
  - Links to Google Doc and PDF
- Test email address should receive separate email

---

## ✅ SUCCESS CRITERIA

If all checks pass:

- ✅ Form submission triggers automation
- ✅ Document generated with correct data
- ✅ PDF created and archived
- ✅ Emails sent to all parties
- ✅ Master database updated

**YOU'RE LIVE!** System is operational.

---

## 🔧 TROUBLESHOOTING

**Problem:** No row added to Sheet
**Fix:** Check form is linked to Sheet (Step 4, item 6)

**Problem:** Script doesn't run
**Fix:** Check trigger created (Step 6) and authorized

**Problem:** Merge fields not replaced
**Fix:** Check {{FIELD_NAME}} syntax matches exactly between form and template

**Problem:** Email not sent
**Fix:** Check EMAIL_RECIPIENTS in CONFIG section

**Problem:** Error: "Cannot find folder"
**Fix:** Double-check folder IDs in CONFIG (Step 1, item 3)

**Problem:** Script timeout
**Fix:** Simplify script (remove archive copy initially)

---

## 🚀 NEXT STEPS AFTER SUCCESS

1. **Add to website:**
   - Update index.html with Legal Forms section
   - Replace form URL with your forms.gle link
   - Deploy to production

2. **Create additional forms:**
   - Repeat process for Service Agreement
   - Repeat for Statement of Work
   - Repeat for Change Order

3. **Set up backups:**
   - Implement daily backup script
   - Set Archive retention policy

4. **Attorney review:**
   - Have attorney review first generated document
   - Make template adjustments as needed

---

## 📋 CONFIGURATION SUMMARY

**Save these values for reference:**

```
TEMPLATES_FOLDER_ID: ____________________
EXECUTED_FOLDER_ID: ____________________
ARCHIVE_FOLDER_ID: ____________________
NDA_TEMPLATE_ID: ____________________
NDA_SHEET_ID: ____________________
NDA_FORM_URL: https://forms.gle/____________________
```

---

## 🆘 NEED HELP?

**Check Execution Log:**

1. Open Apps Script editor
2. View → Executions
3. See what triggered, errors

**Test Manually:**

1. In Apps Script, click "Run" → `onFormSubmit`
2. (Will fail without event data, but tests basic script)

**Email Yourself:**
Add to script for debugging:

```javascript
Logger.log("Script started");
Logger.log("Form data: " + JSON.stringify(formData));
```

Then check: View → Logs

---

**Last Updated:** January 29, 2026
**Estimated Setup Time:** 30 minutes (first time), 10 minutes (subsequent forms)
**Cost:** $0 (100% Google Workspace included)
