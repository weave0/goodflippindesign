/**
 * Legal Forms Automation Handler (AWS Lambda)
 * Generates legal documents from templates and emails them
 *
 * Environment Variables Required:
 * - SENDGRID_API_KEY or AWS_SES_REGION (for email delivery)
 * - GOOGLE_DOCS_API_KEY (optional, for Google Docs integration)
 */

const AWS = require('aws-sdk');
const ses = new AWS.SES({ region: 'us-east-1' });

/**
 * Document Templates with merge fields
 */
const TEMPLATES = {
  nda: {
    name: 'Non-Disclosure Agreement',
    content: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of {{DATE}}, by and between:

PARTY A: GFV LLC DBA Good Flippin Design
Address: {{BUSINESS_ADDRESS}}
Email: getsome@goodflippinvibes.com

PARTY B: {{PARTY_NAME}}
Company: {{PARTY_COMPANY}}
Address: {{PARTY_ADDRESS}}
Email: {{PARTY_EMAIL}}

PURPOSE: {{PURPOSE}}

WHEREAS, the parties wish to explore a business opportunity of mutual interest and benefit (the "Purpose");

WHEREAS, in connection with the Purpose, each party may disclose to the other certain confidential technical and business information that the disclosing party desires the receiving party to treat as confidential;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, the parties agree as follows:

1. CONFIDENTIAL INFORMATION

For purposes of this Agreement, "Confidential Information" means all information or material that has or could have commercial value or other utility in the business in which Disclosing Party is engaged. Confidential Information includes, but is not limited to:

a) Technical data, trade secrets, know-how, research, product plans, products, services, customers, customer lists, markets, software, developments, inventions, processes, formulas, technology, designs, drawings, engineering, hardware configuration information, marketing, finances or other business information.

b) Information disclosed in writing, orally, or by inspection of tangible objects, which is designated as "Confidential," "Proprietary" or some similar designation.

2. OBLIGATIONS OF RECEIVING PARTY

The Receiving Party agrees to:

a) Hold and maintain the Confidential Information in strict confidence;
b) Not disclose the Confidential Information to third parties without prior written consent;
c) Not use the Confidential Information except for the Purpose;
d) Protect the Confidential Information with the same degree of care used to protect its own confidential information;
e) Limit access to the Confidential Information to employees, contractors, and agents who need to know such information.

3. TERM

This Agreement shall remain in effect for a period of {{TERM_YEARS}} years from the Effective Date.

4. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the State of Minnesota.

5. ENTIRE AGREEMENT

This Agreement constitutes the entire agreement between the parties concerning the subject matter hereof.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

GFV LLC DBA Good Flippin Design          {{PARTY_COMPANY}}

By: _______________________              By: _______________________
Name: Brett Weaver                       Name: {{PARTY_NAME}}
Title: Principal                         Title: {{PARTY_TITLE}}
Date: {{DATE}}                          Date: _______________

---
Document ID: {{DOCUMENT_ID}}
Generated: {{TIMESTAMP}}
`,
  },
  service_agreement: {
    name: 'Service Agreement',
    content: `CLIENT SERVICES AGREEMENT

This Client Services Agreement ("Agreement") is entered into as of {{DATE}}, by and between:

SERVICE PROVIDER: GFV LLC DBA Good Flippin Design
Principal: Brett Weaver
Email: getsome@goodflippinvibes.com
Address: {{BUSINESS_ADDRESS}}

CLIENT: {{CLIENT_NAME}}
Company: {{CLIENT_COMPANY}}
Email: {{CLIENT_EMAIL}}
Address: {{CLIENT_ADDRESS}}

PROJECT: {{PROJECT_TYPE}}
BUDGET: {{BUDGET_RANGE}}
TIMELINE: {{TIMELINE}}

1. SERVICES

Service Provider agrees to provide the following services ("Services"):
{{SERVICES_DESCRIPTION}}

2. COMPENSATION

Client agrees to pay Service Provider as follows:
- Total Project Fee: {{PROJECT_FEE}}
- Payment Schedule: {{PAYMENT_SCHEDULE}}
- Payment Terms: Net 15 days from invoice date

3. INTELLECTUAL PROPERTY

Upon full payment, all work product created under this Agreement shall be owned by Client. Service Provider retains the right to use the work in portfolio materials.

4. WARRANTIES

Service Provider warrants that:
a) Services will be performed in a professional and workmanlike manner
b) All deliverables will be original work or properly licensed
c) Services will not infringe upon third-party intellectual property rights

5. LIMITATION OF LIABILITY

Service Provider's total liability under this Agreement shall not exceed the total fees paid by Client.

6. TERM AND TERMINATION

This Agreement begins on {{START_DATE}} and continues until completion of Services or earlier termination by either party with 14 days written notice.

7. GOVERNING LAW

This Agreement shall be governed by the laws of the State of Minnesota.

IN WITNESS WHEREOF, the parties have executed this Agreement.

GFV LLC DBA Good Flippin Design          {{CLIENT_COMPANY}}

By: _______________________              By: _______________________
Name: Brett Weaver                       Name: {{CLIENT_NAME}}
Title: Principal                         Title: {{CLIENT_TITLE}}
Date: {{DATE}}                          Date: _______________

---
Document ID: {{DOCUMENT_ID}}
Generated: {{TIMESTAMP}}
`,
  },
  sow: {
    name: 'Statement of Work',
    content: `STATEMENT OF WORK

SOW Number: {{SOW_NUMBER}}
Master Agreement: {{MASTER_AGREEMENT_ID}}
Project: {{PROJECT_NAME}}
Date: {{DATE}}

CLIENT: {{CLIENT_NAME}}
{{CLIENT_COMPANY}}

SERVICE PROVIDER: GFV LLC DBA Good Flippin Design

1. PROJECT SCOPE

{{PROJECT_SCOPE}}

2. DELIVERABLES

{{DELIVERABLES}}

3. TIMELINE

Project Start Date: {{START_DATE}}
Project End Date: {{END_DATE}}

Milestones:
{{MILESTONES}}

4. BUDGET

Total Project Budget: {{TOTAL_BUDGET}}

Payment Schedule:
{{PAYMENT_SCHEDULE}}

5. ACCEPTANCE CRITERIA

{{ACCEPTANCE_CRITERIA}}

6. ASSUMPTIONS AND DEPENDENCIES

{{ASSUMPTIONS}}

7. EXCLUSIONS

The following are explicitly excluded from this SOW:
{{EXCLUSIONS}}

---
This Statement of Work is governed by the Master Client Services Agreement dated {{MASTER_AGREEMENT_DATE}}.

Signatures:

GFV LLC DBA Good Flippin Design          {{CLIENT_COMPANY}}

By: _______________________              By: _______________________
Name: Brett Weaver                       Name: {{CLIENT_NAME}}
Date: {{DATE}}                          Date: _______________

---
Document ID: {{DOCUMENT_ID}}
Generated: {{TIMESTAMP}}
`,
  },
  change_order: {
    name: 'Change Order',
    content: `CHANGE ORDER

Change Order Number: {{CHANGE_ORDER_NUMBER}}
Related SOW: {{SOW_NUMBER}}
Date: {{DATE}}

CLIENT: {{CLIENT_NAME}}
{{CLIENT_COMPANY}}

SERVICE PROVIDER: GFV LLC DBA Good Flippin Design

1. CHANGE DESCRIPTION

{{CHANGE_DESCRIPTION}}

2. REASON FOR CHANGE

{{CHANGE_REASON}}

3. IMPACT ANALYSIS

Timeline Impact:
- Original End Date: {{ORIGINAL_END_DATE}}
- New End Date: {{NEW_END_DATE}}
- Additional Days: {{ADDITIONAL_DAYS}}

Budget Impact:
- Original Budget: {{ORIGINAL_BUDGET}}
- Additional Cost: {{ADDITIONAL_COST}}
- New Total Budget: {{NEW_TOTAL_BUDGET}}

Scope Impact:
{{SCOPE_IMPACT}}

4. REVISED DELIVERABLES

{{REVISED_DELIVERABLES}}

5. APPROVAL

By signing below, both parties agree to the changes outlined in this Change Order.

GFV LLC DBA Good Flippin Design          {{CLIENT_COMPANY}}

By: _______________________              By: _______________________
Name: Brett Weaver                       Name: {{CLIENT_NAME}}
Date: {{DATE}}                          Date: _______________

---
Document ID: {{DOCUMENT_ID}}
Generated: {{TIMESTAMP}}
`,
  },
};

/**
 * Generate unique document ID
 */
function generateDocumentId(type) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${type.toUpperCase()}-${timestamp}-${random}`;
}

/**
 * Fill template with merge fields
 */
function fillTemplate(template, data) {
  let filled = template;

  // Add automatic fields
  const now = new Date();
  const autoData = {
    ...data,
    DATE: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    TIMESTAMP: now.toISOString(),
    DOCUMENT_ID: data.DOCUMENT_ID || generateDocumentId(data.type || 'DOC'),
    BUSINESS_ADDRESS: 'Minneapolis, MN',
  };

  // Replace all {{FIELD}} markers
  for (const [key, value] of Object.entries(autoData)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    filled = filled.replace(regex, value || '[NOT PROVIDED]');
  }

  return filled;
}

/**
 * Send document via email using AWS SES
 */
async function sendEmail(to, subject, documentText, documentId) {
  const params = {
    Source: 'getsome@goodflippinvibes.com',
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to],
      BccAddresses: ['getsome@goodflippinvibes.com', 'brett.l.weaver@gmail.com'],
    },
    Message: {
      Subject: { Data: subject },
      Body: {
        Text: {
          Data: `Thank you for your request. Your document is ready for review.

Document ID: ${documentId}

Please review the document below. If you need any changes, reply to this email.

---

${documentText}

---

Next Steps:
1. Review the document carefully
2. If acceptable, print, sign, and scan
3. Email signed copy to getsome@goodflippinvibes.com
4. We'll countersign and send you the final executed copy

Questions? Reply to this email or call during business hours.

Best regards,
Brett Weaver
Good Flippin Design
getsome@goodflippinvibes.com
`,
        },
      },
    },
  };

  try {
    await ses.sendEmail(params).promise();
    console.log(`Email sent to ${to.join(', ')}`);
    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Lambda handler
 */
exports.handler = async (event) => {
  console.log('Legal forms request:', JSON.stringify(event, null, 2));

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body);
    const { type, data } = body;

    // Validate type
    if (!TEMPLATES[type]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Invalid document type: ${type}` }),
      };
    }

    // Generate document ID
    const documentId = generateDocumentId(type);

    // Fill template
    const filledDocument = fillTemplate(TEMPLATES[type].content, {
      ...data,
      type,
      DOCUMENT_ID: documentId,
    });

    // Send email
    const recipientEmail = data.PARTY_EMAIL || data.CLIENT_EMAIL || data.email;
    const emailResult = await sendEmail(
      recipientEmail,
      `Your ${TEMPLATES[type].name} is Ready - Document ${documentId}`,
      filledDocument,
      documentId
    );

    // Return response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        documentId,
        emailSent: emailResult.success,
        message: `${TEMPLATES[type].name} generated and emailed to ${recipientEmail}`,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
