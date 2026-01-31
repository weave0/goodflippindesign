# Legal Forms Automation - Deployment Guide

**Status:** ✅ Code Complete | 🟡 AWS Setup Required
**Created:** January 29, 2026

---

## 🎯 What You Built

Automated legal document generation system that replaces manual email exchanges with instant form-to-email workflow.

### **Live Forms**

1. **NDA Request** - `/assets/forms/nda-request.html`
2. **Service Agreement** - `/assets/forms/service-agreement-request.html`
3. **SOW Request** - _Coming Soon_
4. **Change Order** - _Coming Soon_

### **Backend**

- `functions/api/legal-forms.js` - AWS Lambda handler
- Templates for 4 document types (NDA, Service Agreement, SOW, Change Order)
- Email delivery via AWS SES
- Unique document ID generation

---

## 🚀 Quick Deploy to AWS Lambda

### **Option 1: AWS Console (5 minutes)**

1. **Go to AWS Lambda Console**
   - https://console.aws.amazon.com/lambda/
   - Region: `us-east-1` (same as your donation backend)

2. **Create Function**
   - Name: `legal-forms-handler`
   - Runtime: **Node.js 20.x**
   - Architecture: **x86_64**
   - Permissions: **Create new role with basic Lambda permissions**

3. **Upload Code**
   - Copy contents of `functions/api/legal-forms.js`
   - Paste into Lambda code editor
   - Click **Deploy**

4. **Configure Environment**
   - Timeout: **30 seconds** (default 3s is too short)
   - Memory: **256 MB** (default 128 MB may be too low)

5. **Add AWS SES Permissions**
   - Go to **Configuration** → **Permissions**
   - Click role name (opens IAM)
   - **Add permissions** → **Attach policies** → Search `AmazonSESFullAccess`
   - Attach policy

6. **Create API Gateway Trigger**
   - Click **Add trigger**
   - Select **API Gateway**
   - API: **Create new REST API**
   - Security: **Open** (CORS enabled)
   - Click **Add**
   - Copy the **API endpoint URL** (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/default/legal-forms-handler`)

7. **Update Form URLs**
   - Edit `assets/forms/nda-request.html` line 213:
     ```javascript
     const API_ENDPOINT = "YOUR_API_ENDPOINT_HERE";
     ```
   - Replace with your Lambda API URL
   - Do same for `service-agreement-request.html`

8. **Configure AWS SES**
   - Go to https://console.aws.amazon.com/ses/
   - **Email Addresses** → **Verify a New Email Address**
   - Add: `getsome@goodflippinvibes.com`
   - Check email and click verification link
   - Verify `brett.l.weaver@gmail.com` too
   - **Move out of sandbox:**
     - SES → **Account dashboard** → **Request production access**
     - Use case: "Automated legal document delivery for web development consultancy"
     - Sends ~10 emails/month

---

### **Option 2: AWS CLI (2 minutes)**

```bash
# Package function
cd "Z:\Good Flippin Design\functions\api"
zip -r legal-forms.zip legal-forms.js

# Create Lambda function
aws lambda create-function \
  --function-name legal-forms-handler \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-basic-execution \
  --handler legal-forms.handler \
  --zip-file fileb://legal-forms.zip \
  --timeout 30 \
  --memory-size 256 \
  --region us-east-1

# Attach SES permissions
aws lambda update-function-configuration \
  --function-name legal-forms-handler \
  --environment Variables={AWS_SES_REGION=us-east-1}

# Create API Gateway
aws apigatewayv2 create-api \
  --name legal-forms-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:legal-forms-handler
```

---

## 🧪 Testing the Flow

### **1. Test Locally (Optional)**

```javascript
// Test Lambda function locally with Node.js
const handler = require("./functions/api/legal-forms.js");

const testEvent = {
  httpMethod: "POST",
  body: JSON.stringify({
    type: "nda",
    data: {
      PARTY_NAME: "Test User",
      PARTY_EMAIL: "test@example.com",
      PARTY_COMPANY: "Test Corp",
      PURPOSE: "Testing automation",
      TERM_YEARS: "3",
    },
  }),
};

handler.handler(testEvent).then(console.log);
```

### **2. Test via Form**

1. Go to **goodflippindesign.com/assets/forms/nda-request.html**
2. Fill in your email
3. Submit
4. Check email (including spam folder)
5. Verify document looks correct

### **3. Verify in AWS**

- **CloudWatch Logs**: Lambda → Monitor → View logs in CloudWatch
- **SES Dashboard**: Sending Statistics (should show 1 email sent)

---

## 📧 Email Configuration

Your emails will come from **getsome@goodflippinvibes.com** and BCC to:

- `getsome@goodflippinvibes.com`
- `brett.l.weaver@gmail.com`

### **Email Template**

```
Subject: Your [Document Type] is Ready - Document [ID]

Thank you for your request. Your document is ready for review.

Document ID: NDA-20260129T123456-ABC123

[Full document text]

Next Steps:
1. Review the document carefully
2. If acceptable, print, sign, and scan
3. Email signed copy to getsome@goodflippinvibes.com
4. We'll countersign and send final executed copy
```

---

## 🔧 Troubleshooting

### **Email Not Sending**

- ✅ Verify SES email addresses
- ✅ Check Lambda has SES permissions
- ✅ Look at CloudWatch logs for errors
- ✅ SES might be in sandbox (limits to verified addresses only)

### **Form Submit Fails**

- ✅ Check browser console for CORS errors
- ✅ Verify API Gateway has CORS enabled
- ✅ Check Lambda timeout (needs 30s not 3s)

### **Document Missing Fields**

- ✅ Check form field names match template `{{FIELDS}}`
- ✅ Verify data object in JavaScript matches backend expectations

---

## 🎨 Customization

### **Change Email Template**

Edit `functions/api/legal-forms.js` function `sendEmail()`:

```javascript
Body: {
  Text: {
    Data: `Your custom email message here...`;
  }
}
```

### **Add New Document Type**

1. Add template to `TEMPLATES` object in `legal-forms.js`
2. Create HTML form (copy nda-request.html)
3. Update form submission to use new type name
4. Redeploy Lambda

### **Switch to Google Docs**

Future upgrade: Replace `fillTemplate()` function with Google Docs API call to:

- Use Google Doc templates with nicer formatting
- Generate PDFs automatically
- Store in Google Drive
- Get shareable links

See: `Legal/Automation/GOOGLE_WORKSPACE_AUTOMATION_GUIDE.md`

---

## 💰 Cost Estimate

**AWS Lambda:**

- First 1M requests/month: **FREE**
- After: $0.20 per 1M requests

**AWS SES:**

- First 62,000 emails/month (via Lambda): **FREE**
- After: $0.10 per 1,000 emails

**Expected monthly cost:** **$0** (well within free tier)

---

## 📊 Monitoring

### **Track Form Submissions**

- CloudWatch Logs: See every form submission
- SES Dashboard: Email delivery stats
- Consider adding Google Analytics events

### **Metrics to Watch**

- Forms submitted vs emails sent (should match)
- Email bounce rate (should be < 5%)
- CloudWatch errors/warnings

---

## 🔄 Next Steps

### **Immediate (This Week)**

- [ ] Deploy Lambda to AWS
- [ ] Test NDA form end-to-end
- [ ] Verify emails arriving correctly
- [ ] Move SES out of sandbox (production access)

### **Short-term (This Month)**

- [ ] Create SOW request form
- [ ] Create Change Order form
- [ ] Add Google Analytics tracking
- [ ] Set up email templates in SES

### **Long-term (Next Quarter)**

- [ ] Upgrade to Google Docs API for PDF generation
- [ ] Add DocuSign integration for e-signatures
- [ ] Build admin dashboard to view all requests
- [ ] Archive documents to immutable storage

---

## 📝 Legal Disclaimer

**IMPORTANT:** All document templates should be reviewed by a licensed Minnesota attorney before use in production. This system is for automation purposes only and does not constitute legal advice.

Current templates are based on standard forms but **must be customized** to your specific business needs and legal requirements.

---

**Questions?** Check `Legal/Automation/GOOGLE_WORKSPACE_AUTOMATION_GUIDE.md` for full documentation.
