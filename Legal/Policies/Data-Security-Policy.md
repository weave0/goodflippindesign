# Data Security and Privacy Policy

## GFV LLC DBA Good Flippin Design

**Internal Use Only - Not for Public Display**

**Policy Version:** 1.0 DRAFT
**Effective Date:** [TO BE DETERMINED AFTER ATTORNEY REVIEW]
**Last Updated:** January 29, 2026
**Status:** ⚠️ ATTORNEY REVIEW REQUIRED

---

## ⚖️ ATTORNEY REVIEW REQUIRED

**This is an internal operational policy that has NOT been reviewed by legal counsel.**

**Before implementing:**

1. Review by MN attorney with data security/HIPAA experience
2. Review by cybersecurity professional or IT auditor
3. Insurance broker review (cyber liability coverage)
4. Remove this warning after approval

---

## 1. PURPOSE AND SCOPE

### 1.1 Purpose

This Data Security and Privacy Policy establishes the standards, procedures, and practices for protecting sensitive information handled by **GFV LLC DBA Good Flippin Design** ("Company," "we," "us").

**Objectives:**

- Protect client data from unauthorized access, use, or disclosure
- Comply with federal and Minnesota data protection laws
- Maintain client trust and professional reputation
- Minimize risk of data breach and associated liabilities
- Establish clear protocols for employees, contractors, and systems

### 1.2 Scope

This Policy applies to:

**All Persons:**

- Owner/principal (Brett Weaver)
- Employees (current and future)
- Independent contractors and subcontractors
- Vendors with access to sensitive data
- Business associates (HIPAA context)

**All Data:**

- Client confidential information
- Protected Health Information (PHI) - if applicable
- Personally Identifiable Information (PII)
- Business proprietary information
- Financial records and payment data
- Login credentials and access keys
- Source code and intellectual property

**All Systems:**

- Company-owned devices (laptops, phones, tablets)
- Personal devices used for business (BYOD)
- Cloud services and SaaS platforms
- Client systems accessed remotely
- Development, staging, and production environments
- Email and communication platforms

### 1.3 Regulatory Compliance

This Policy is designed to comply with:

**Federal Laws:**

- Health Insurance Portability and Accountability Act (HIPAA) - 45 C.F.R. Parts 160, 164
- HITECH Act - Breach notification and enhanced penalties
- Gramm-Leach-Bliley Act (GLBA) - If handling financial data
- Federal Trade Commission Act - Reasonable data security
- Electronic Communications Privacy Act (ECPA)

**Minnesota Laws:**

- Minnesota Data Breach Notification Law - Minn. Stat. § 325M.01 et seq.
- Minnesota Government Data Practices Act - Minn. Stat. Ch. 13 (for government clients)
- Minnesota Unauthorized Computer Access - Minn. Stat. § 609.891
- Minnesota Identity Theft Law - Minn. Stat. § 609.527

**Industry Standards:**

- NIST Cybersecurity Framework
- OWASP Top 10 (web application security)
- PCI-DSS (if processing payment cards)
- WCAG 2.1 (accessibility and privacy)

---

## 2. ROLES AND RESPONSIBILITIES

### 2.1 Designated Security Officer

**Role**: Privacy and Security Officer
**Person**: [Brett Weaver OR designate if hiring staff]
**Responsibilities:**

- Oversee implementation and enforcement of this Policy
- Conduct annual security risk assessments
- Manage incident response and breach notifications
- Coordinate with legal counsel and cybersecurity experts
- Approve exceptions to Policy
- Maintain security documentation and training records

### 2.2 All Personnel

**Every person with access to Company data must:**

1. **Read and Acknowledge**: Review this Policy annually and sign acknowledgment
2. **Follow Procedures**: Comply with all security protocols and standards
3. **Report Incidents**: Immediately report suspected security incidents or breaches
4. **Protect Credentials**: Safeguard passwords, API keys, and access tokens
5. **Use Encryption**: Encrypt sensitive data in transit and at rest
6. **Limit Access**: Access only data necessary for job responsibilities
7. **Secure Devices**: Lock devices when unattended, use strong passwords
8. **Avoid Public Wi-Fi**: Use VPN when connecting from public networks
9. **Recognize Phishing**: Avoid clicking suspicious links or opening unexpected attachments
10. **Question Unauthorized Requests**: Verify unusual data access requests before complying

### 2.3 Contractors and Vendors

**Before granting access to Company or client data:**

1. Execute **Confidentiality Agreement** or **Business Associate Agreement** (if PHI)
2. Verify security practices (encryption, access controls, breach notification)
3. Limit access to minimum necessary for services performed
4. Require notification of security incidents within 24 hours
5. Audit compliance periodically (annually for high-risk vendors)
6. Terminate access immediately upon end of services

---

## 3. DATA CLASSIFICATION

### 3.1 Classification Levels

All data is classified into one of four categories:

#### **Level 1: PUBLIC**

**Definition**: Information intended for public consumption

**Examples:**

- Marketing materials (website, brochures)
- Published portfolio work (with client permission)
- Public social media posts
- Press releases
- Publicly available open-source code

**Security Requirements:**

- No special protection required
- May be freely shared

#### **Level 2: INTERNAL**

**Definition**: Company business information not for public release

**Examples:**

- Internal processes and methodologies
- Business plans and strategies
- Financial records (not containing PII)
- Employee handbooks and policies
- Non-confidential client communications

**Security Requirements:**

- Protect from unauthorized public disclosure
- Limit to Company personnel and authorized contractors
- Moderate encryption (TLS for transmission)

#### **Level 3: CONFIDENTIAL**

**Definition**: Sensitive business information requiring strong protection

**Examples:**

- Client confidential information (business plans, trade secrets)
- Proprietary source code (not delivered to client)
- Contract terms and pricing
- Client login credentials
- Payment information (masked card numbers)
- Personal data (PII): names, addresses, emails, phone numbers
- Tax records (EIN, SSN if applicable)

**Security Requirements:**

- **Encryption at rest**: AES-256 or equivalent
- **Encryption in transit**: TLS 1.2+ (HTTPS)
- **Access controls**: Need-to-know basis only
- **Audit logging**: Track all access to confidential data
- **Secure deletion**: Shred physical documents, wipe digital data

#### **Level 4: RESTRICTED (PHI / HIGHLY SENSITIVE)**

**Definition**: Data requiring strictest protection due to legal/regulatory requirements

**Examples:**

- **Protected Health Information (PHI)**: Medical records, diagnoses, treatment info
- **Financial Account Numbers**: Unmasked credit cards, bank accounts
- **Authentication Credentials**: Passwords, private keys, API secrets
- **Social Security Numbers**: Full SSN (avoid collecting if possible)
- **Government IDs**: Driver's license numbers, passport numbers

**Security Requirements:**

- **Business Associate Agreement** required for PHI
- **Encryption at rest**: AES-256, FIPS 140-2 compliant
- **Encryption in transit**: TLS 1.3, mutual TLS if feasible
- **Multi-factor authentication** for access
- **Access logging and monitoring**: Real-time alerts for unusual activity
- **Annual risk assessment** for systems handling restricted data
- **Breach notification**: Immediate escalation to Security Officer
- **Minimize collection**: Only collect if absolutely necessary

### 3.2 Data Handling Matrix

| Classification | Encryption                          | Access                 | Retention               | Disposal              |
| -------------- | ----------------------------------- | ---------------------- | ----------------------- | --------------------- |
| Public         | Optional                            | No restrictions        | Indefinite              | Normal deletion       |
| Internal       | TLS in transit                      | Company personnel      | As needed               | Secure deletion       |
| Confidential   | AES-256 at rest, TLS in transit     | Need-to-know           | 7 years (contracts/tax) | Shred/wipe            |
| Restricted     | AES-256 at rest, TLS 1.3 in transit | Minimal necessary, MFA | Minimal retention       | Certified destruction |

---

## 4. TECHNICAL SAFEGUARDS

### 4.1 Encryption Standards

**All sensitive data MUST be encrypted:**

**Data at Rest:**

- **Confidential/Restricted Data**: AES-256 encryption minimum
- **Tools**: BitLocker (Windows), FileVault (Mac), LUKS (Linux), VeraCrypt
- **Cloud Storage**: Verify provider uses AES-256 (AWS S3, Azure Blob Storage, Google Cloud Storage)
- **Databases**: Transparent Data Encryption (TDE) or application-level encryption

**Data in Transit:**

- **Web Traffic**: HTTPS only (TLS 1.2 minimum, TLS 1.3 preferred)
- **Email**: TLS for email transmission (enforced on mail server)
- **File Transfer**: SFTP, SCP, or encrypted cloud links (no FTP, HTTP)
- **API Calls**: HTTPS with API keys, OAuth 2.0, or mutual TLS

**Encryption Key Management:**

- Keys stored separately from encrypted data
- Use key management service (AWS KMS, Azure Key Vault) for production systems
- Rotate encryption keys annually or after suspected compromise
- Never commit encryption keys to version control (use .env files, vaults)

### 4.2 Access Controls

**Principle of Least Privilege**: Users granted minimum access necessary for job function

**Authentication Requirements:**

| Data Level   | Authentication                                 |
| ------------ | ---------------------------------------------- |
| Public       | None required                                  |
| Internal     | Password (12+ chars, complexity)               |
| Confidential | Strong password + periodic review              |
| Restricted   | **Multi-Factor Authentication (MFA)** required |

**Password Standards:**

- **Minimum Length**: 12 characters (16+ for admin accounts)
- **Complexity**: Mix of uppercase, lowercase, numbers, symbols
- **No Reuse**: Different password for each system
- **Password Manager**: Required (1Password, LastPass, Bitwarden)
- **Expiration**: Change passwords every 90 days for high-risk accounts
- **Compromised Password**: Change immediately upon suspected compromise

**Multi-Factor Authentication (MFA):**

- **Required for**: AWS, Azure, Google Cloud, GitHub, client systems with PHI
- **Preferred Methods**: Authenticator app (Google Authenticator, Authy), hardware token (YubiKey)
- **Avoid**: SMS-based MFA (vulnerable to SIM swapping)

**Role-Based Access Control (RBAC):**

- Owner/Admin: Full access to all systems and data
- Developer: Access to development/staging, limited production access
- Contractor: Access limited to specific project, revoked upon project completion
- Client: Access to their own data only, via secure portal or dedicated credentials

**Access Review:**

- Quarterly review of all access permissions
- Immediate revocation upon termination of employment or contract
- Annual recertification of access for all personnel

### 4.3 Network Security

**Firewall:**

- Enable firewall on all devices (Windows Defender Firewall, macOS Firewall)
- Cloud firewalls configured to allow only necessary ports and IPs
- Default deny rule (block all traffic except explicitly allowed)

**VPN (Virtual Private Network):**

- **Required when**: Accessing client systems from public Wi-Fi (coffee shops, airports)
- **Recommended Tools**: WireGuard, OpenVPN, commercial VPN (NordVPN, ProtonVPN)
- **Configuration**: Kill switch enabled, no DNS leaks

**Wi-Fi Security:**

- **Home Office**: WPA3 encryption (or WPA2 if WPA3 unavailable)
- **Change default credentials**: Router admin password changed from default
- **Disable WPS**: Wi-Fi Protected Setup disabled (vulnerable)
- **Public Wi-Fi**: Avoid for sensitive work; use VPN if necessary

**Intrusion Detection:**

- Enable logging on cloud services (AWS CloudTrail, Azure Monitor)
- Monitor for unusual access patterns (login from new location, data exfiltration)
- Alert on failed login attempts (>5 failures in 15 minutes)

### 4.4 Endpoint Security

**Anti-Malware:**

- **Required**: Endpoint protection software on all devices
- **Options**: Windows Defender (built-in), Malwarebytes, Norton, Bitdefender
- **Updates**: Automatic updates enabled, scanned weekly

**Operating System Updates:**

- **Critical Updates**: Install within 7 days of release
- **Security Patches**: Install within 14 days
- **Automatic Updates**: Enabled for personal devices; managed for Company devices

**Device Encryption:**

- **Full Disk Encryption**: BitLocker (Windows), FileVault (Mac), LUKS (Linux)
- **Verify**: Check encryption status quarterly

**Mobile Devices:**

- Screen lock required (PIN, biometric)
- Auto-lock after 5 minutes of inactivity
- Remote wipe capability enabled (Find My iPhone, Android Device Manager)
- Company data segregated (if possible, use work profile or separate device)

**Screen Lock:**

- Lock screen when leaving device unattended
- Auto-lock after 10 minutes of inactivity (5 minutes for restricted data)

### 4.5 Backup and Recovery

**Backup Frequency:**

- **Critical Data**: Daily automated backups
- **Client Project Data**: Backup before major milestones
- **Source Code**: Version control (Git) + remote repository (GitHub, GitLab)
- **Configurations**: Document infrastructure-as-code (Terraform, Ansible)

**Backup Locations:**

- **3-2-1 Rule**: 3 copies, 2 different media types, 1 offsite
- **Cloud Backups**: Encrypted backups to AWS S3, Azure Blob, Backblaze
- **Local Backups**: External hard drive (encrypted), disconnected when not in use
- **Versioning**: Retain multiple backup versions (30 days minimum)

**Recovery Testing:**

- Test backup restoration **quarterly**
- Document recovery procedures
- Verify backup integrity (no corruption)

**Backup Retention:**

- **Client Data**: 7 years after project completion
- **Financial Records**: 7 years (IRS requirement)
- **Emails**: 2 years rolling
- **System Backups**: 30 days rolling

---

## 5. ADMINISTRATIVE SAFEGUARDS

### 5.1 Security Training

**New Hire Training** (within first 30 days):

- Review of this Data Security Policy
- Phishing awareness and examples
- Password management best practices
- Incident reporting procedures
- Confidentiality obligations
- HIPAA training (if handling PHI)

**Annual Training** (all personnel):

- Review updated security policies
- New threats and attack vectors (ransomware, phishing trends)
- Case studies of data breaches
- Refresher on secure practices

**Specialized Training** (as needed):

- HIPAA Privacy and Security Rules (for healthcare projects)
- PCI-DSS (if processing payments)
- Secure coding practices (OWASP Top 10)

**Training Documentation:**

- Signed acknowledgment of Policy review
- Training completion certificates
- Maintained for audit purposes (7 years)

### 5.2 Risk Assessment

**Annual Security Risk Assessment:**

**Conducted by**: Security Officer or external cybersecurity consultant

**Scope:**

1. Identify all systems handling sensitive data
2. Assess threats and vulnerabilities
3. Evaluate likelihood and impact of potential breaches
4. Document existing safeguards
5. Identify gaps and recommend improvements
6. Prioritize remediation efforts

**Risk Assessment Deliverables:**

- Written risk assessment report
- Risk treatment plan (mitigation strategies)
- Timeline for implementing safeguards
- Cost estimates for security improvements

**Follow-Up:**

- Implement high-priority remediation within 90 days
- Track progress on remediation plan
- Update risk assessment after major changes (new service offering, large client, breach)

### 5.3 Incident Response Plan

**See Section 7 (Security Incident Response) for detailed procedures.**

Key elements:

- Designated Incident Response Team (IRT)
- Clear escalation procedures
- Breach notification timelines
- Forensic investigation protocols
- Communication templates

### 5.4 Vendor Management

**Vendor Risk Assessment:**

Before engaging vendor with access to Company or client data:

1. **Security Questionnaire**: Request vendor's security policies and certifications
2. **Compliance Verification**: SOC 2, ISO 27001, HIPAA compliance (if handling PHI)
3. **Contract Review**: Ensure data protection, breach notification, liability clauses
4. **Access Limitation**: Grant minimum necessary access
5. **Monitoring**: Periodic audits or reviews (annually for critical vendors)

**Critical Vendors** (examples):

- Cloud hosting providers (AWS, Azure, Google Cloud)
- Email service providers (Google Workspace, Microsoft 365)
- Payment processors (Stripe, PayPal)
- Collaboration tools (Slack, Zoom, Asana)
- Backup services (Backblaze, Carbonite)

**Vendor Agreements:**

- Data Processing Agreement (DPA) for GDPR compliance
- Business Associate Agreement (BAA) for HIPAA compliance
- Confidentiality provisions
- Breach notification (within 24 hours)
- Right to audit vendor's security practices

---

## 6. PHYSICAL SAFEGUARDS

### 6.1 Office Security

**If working from home office:**

- **Locked Office**: Lock office door when not present (if feasible)
- **Visitor Restrictions**: Do not allow unauthorized persons access to workspace
- **Clean Desk Policy**: Lock away sensitive documents when not in use
- **Secure Storage**: File cabinet or safe for confidential documents
- **Document Disposal**: Shred sensitive documents before disposal (cross-cut shredder)

**If working from co-working space:**

- **Use Privacy Screen**: Prevent shoulder surfing
- **Never Leave Devices Unattended**: Take laptop to bathroom, lock screen at minimum
- **Secure Storage**: Use locker if available
- **VPN Required**: Always use VPN on shared networks

### 6.2 Device Security

**Device Inventory:**

- Maintain list of all devices used for business
- Serial numbers, encryption status, assigned user
- Review quarterly, update after device changes

**Lost or Stolen Devices:**

1. **Immediate Report**: Notify Security Officer within 1 hour
2. **Remote Wipe**: Activate if sensitive data on device (Find My, MDM)
3. **Change Passwords**: All accounts accessed from device
4. **Assess Exposure**: Determine what data was on device
5. **Breach Notification**: If confidential or restricted data, follow breach protocol (Section 7)

**Device Disposal:**

- **Data Wiping**: Use NIST 800-88 compliant wiping tool (DBAN, Eraser)
- **Physical Destruction**: Destroy hard drives if wiping not feasible (drill, degausser)
- **Certificate of Destruction**: Obtain from disposal vendor if outsourced
- **Remove from Inventory**: Update device inventory

---

## 7. SECURITY INCIDENT RESPONSE

### 7.1 Incident Definition

A **Security Incident** is any event that compromises confidentiality, integrity, or availability of data, including:

**Data Breach:**

- Unauthorized access to confidential or restricted data
- Theft or loss of device containing unencrypted sensitive data
- Accidental disclosure of data to unauthorized party
- Hacking or malware infection
- Ransomware attack

**Security Event (Not Necessarily Breach):**

- Failed login attempts
- Suspicious network traffic
- Phishing email received (not clicked)
- Lost device with encrypted data

### 7.2 Incident Response Team (IRT)

**Primary Contact**: Security Officer (Brett Weaver)

**Team Members:**

- Security Officer (investigation, decision-making)
- Legal Counsel (notification requirements, liability)
- IT/Security Consultant (forensics, remediation)
- Insurance Broker (cyber liability coverage)
- Communications (client notification, if applicable)

**External Resources:**

- Cybersecurity forensics firm (on retainer or emergency contact)
- Law enforcement (FBI Cyber Division if criminal activity)
- Minnesota Attorney General (for breach notification)

### 7.3 Incident Response Phases

#### **Phase 1: DETECTION AND REPORTING**

**How to Report Incident:**

- Email Security Officer immediately: [SECURITY EMAIL]
- If after-hours: Call [EMERGENCY PHONE]
- Subject: "SECURITY INCIDENT - [Brief Description]"

**Report Should Include:**

- What happened? (description of incident)
- When discovered? (date/time)
- What data affected? (type, volume, sensitivity)
- Who discovered? (name, contact)
- Current status (ongoing, contained, unknown)

**Timeline**: Report within **1 hour** of discovery

#### **Phase 2: ASSESSMENT AND CONTAINMENT**

**Actions (within 4 hours):**

1. **Assess Scope**: Determine what data was accessed/disclosed
2. **Contain Incident**:
   - Isolate affected systems (disconnect from network)
   - Change compromised credentials
   - Block malicious IP addresses
   - Disable compromised accounts
3. **Preserve Evidence**: Do not delete logs, emails, or files (needed for investigation)
4. **Notify IRT**: Convene Incident Response Team
5. **Document**: Start incident log (timeline, actions taken, findings)

**Containment Priority:**

- Stop ongoing unauthorized access
- Prevent further data exfiltration
- Protect backup systems from compromise

#### **Phase 3: INVESTIGATION**

**Conduct Forensic Analysis:**

1. **Determine Root Cause**: How did breach occur? (phishing, vulnerability, insider?)
2. **Identify Data Affected**: Specific data elements compromised (names, PHI, SSNs?)
3. **Identify Individuals Affected**: How many people? (for notification purposes)
4. **Assess Harm**: Likelihood and severity of harm to affected individuals
5. **Review Logs**: System logs, access logs, email logs
6. **Interview Personnel**: If insider threat suspected

**External Forensics** (if needed):

- Engage cybersecurity firm for complex breaches
- Preserve chain of custody for potential legal action

**Timeline**: Preliminary findings within **48 hours**; full investigation within **10 days**

#### **Phase 4: NOTIFICATION**

**Legal Obligations:**

**Minnesota Law (Minn. Stat. § 325M.01 et seq.):**

- Notify affected individuals "in the most expedient time possible and without unreasonable delay"
- If >500 Minnesota residents affected, notify Minnesota Attorney General
- If media reports likely, issue public statement

**HIPAA Breach Notification Rule (45 C.F.R. § 164.410):**

- Notify affected individuals within **60 days** of discovery
- If >500 affected, notify HHS Office for Civil Rights and prominent media outlet
- If <500 affected, maintain log and notify HHS annually
- Notify business associates if breach at their level

**Notification Content (Must Include):**

1. **What Happened**: Description of breach in plain language
2. **What Data**: Types of information compromised
3. **What We're Doing**: Steps taken to investigate and remediate
4. **What You Should Do**: Recommendations for affected individuals (credit monitoring, password changes)
5. **Contact Info**: How to reach Company for questions

**Sample Notification Letter Template**: [Maintained separately, reviewed by attorney]

**Timeline:**

- Minnesota breach: Notify "without unreasonable delay" (typically within 30 days)
- HIPAA breach: Within 60 days
- GDPR breach (if applicable): Within 72 hours

#### **Phase 5: REMEDIATION**

**Immediate Remediation (within 7 days):**

1. Patch vulnerabilities that caused breach
2. Implement additional security controls
3. Reset credentials for all affected systems
4. Review and update access controls
5. Enhance monitoring (alerts for similar activity)

**Long-Term Remediation (within 90 days):**

1. Implement recommendations from forensic investigation
2. Update security policies and procedures
3. Additional training for personnel
4. Technology upgrades (e.g., implement MFA, encryption)
5. Contract review with vendors (if vendor caused breach)

#### **Phase 6: POST-INCIDENT REVIEW**

**Lessons Learned Meeting** (within 30 days of incident closure):

**Attendees:** IRT, affected personnel, legal counsel

**Agenda:**

1. What happened? (incident timeline)
2. What worked well? (effective response actions)
3. What could be improved? (gaps identified)
4. What changes needed? (policy, technology, training)
5. Action items: Who, what, when

**Deliverables:**

- Incident report (detailed summary)
- Lessons learned document
- Action plan for improvements
- Updated policies/procedures

---

## 8. DATA RETENTION AND DESTRUCTION

### 8.1 Retention Schedule

**Retention Period Rationale:**

- Legal compliance (tax, contracts, employment)
- Business necessity (ongoing support, warranties)
- Litigation risk (statute of limitations)
- Client requests

| Data Type                    | Retention Period                  | Legal Basis                                            |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ |
| **Client Contracts**         | 7 years after completion          | Statute of limitations (MN: 6 years contract) + buffer |
| **Financial Records**        | 7 years                           | IRS requirement (3-7 years depending on item)          |
| **Tax Returns**              | Permanent                         | Best practice                                          |
| **Project Files/Code**       | 7 years after delivery            | Warranty period + legal claims                         |
| **Emails (Business)**        | 2 years                           | Business necessity                                     |
| **Emails (Legal/Contracts)** | 7 years                           | Related to contracts                                   |
| **PHI (if applicable)**      | 6 years from creation or last use | HIPAA requirement (45 C.F.R. § 164.530(j)(2))          |
| **Employee Records**         | 7 years after termination         | Employment law compliance                              |
| **Marketing Materials**      | Until superseded                  | Business necessity                                     |
| **Audit Logs**               | 1 year                            | Security monitoring                                    |

**Litigation Hold**: If litigation is pending or anticipated, suspend destruction of relevant records until litigation concludes.

### 8.2 Secure Destruction

**Paper Documents:**

- **Method**: Cross-cut shredding (minimum 5/32" x 1-1/2" particles)
- **Vendor**: Use certified shredding service if volume is large
- **Certificate**: Obtain certificate of destruction

**Electronic Data:**

- **Method**: NIST SP 800-88 compliant data sanitization
- **Tools**: DBAN (Darik's Boot and Nuke), Eraser, BitRaser
- **Verification**: Verify data is unrecoverable
- **Physical Destruction**: Drill holes in hard drive platters or use degausser

**Cloud Data:**

- Delete from cloud storage (S3, Azure Blob, Google Cloud Storage)
- Verify deletion (not just "soft delete")
- Delete backups and snapshots
- Revoke access keys and credentials

**Destruction Log:**

- Maintain log of data destruction activities
- Include: Date, data type, destruction method, person responsible
- Retain destruction log for audit purposes (7 years)

---

## 9. SPECIAL PROTECTIONS FOR HIPAA COMPLIANCE

### 9.1 When HIPAA Applies

**HIPAA applies when:**

- Company creates, receives, maintains, or transmits **Protected Health Information (PHI)** on behalf of a covered entity (healthcare provider, health plan, clearinghouse)
- Company is a **Business Associate** under HIPAA

**Examples of PHI:**

- Patient names + medical condition
- Medical record numbers
- Treatment information
- Health insurance information
- Any health information that can be linked to an individual

**PHI does NOT include:**

- De-identified health information (identifying elements removed)
- Employment records (not health plan related)
- Educational records (covered by FERPA)

### 9.2 Business Associate Agreement (BAA) Requirement

**BEFORE accessing PHI, Company MUST:**

1. Execute **HIPAA Business Associate Agreement** with covered entity client
2. Receive written authorization to access PHI
3. Understand permitted uses and disclosures
4. Implement HIPAA Security Rule safeguards (see Section 9.3)

**Company will NOT access PHI without signed BAA.**

### 9.3 HIPAA Security Rule Compliance

**If handling PHI, Company must implement:**

**Administrative Safeguards:**

- Designated Privacy Officer and Security Officer
- Workforce training on HIPAA Privacy and Security Rules
- Risk analysis and risk management plan
- Sanctions policy for violations
- Contingency plan (backup, disaster recovery)

**Technical Safeguards:**

- Unique user identification (no shared accounts)
- Emergency access procedure (break-glass accounts)
- Automatic logoff (15 minutes inactivity for PHI systems)
- Encryption of PHI in transit and at rest (addressable but strongly recommended)
- Audit controls (track access to PHI)

**Physical Safeguards:**

- Facility access controls (locked office, badge access)
- Workstation security (privacy screens, clean desk)
- Device and media controls (encryption, secure disposal)

### 9.4 Minimum Necessary Standard

**Access to PHI limited to minimum necessary** to accomplish intended purpose.

**Examples:**

- Developer needs access to database structure, NOT actual patient names
- Use de-identified or synthetic data for testing/development
- Masked data in non-production environments (replace SSN with fake, PHI with lorem ipsum)

**Exceptions**: Treatment, payment, and healthcare operations may not require minimum necessary restriction (but still best practice).

### 9.5 HIPAA Breach Notification

**PHI Breach Notification Deadlines:**

| Breach Size          | Notification Requirement           | Deadline                         |
| -------------------- | ---------------------------------- | -------------------------------- |
| **<500 individuals** | Notify affected individuals        | Within 60 days of discovery      |
|                      | Log breach                         | Annual report to HHS             |
|                      | Notify covered entity client       | Within 60 days                   |
| **≥500 individuals** | Notify affected individuals        | Within 60 days                   |
|                      | Notify HHS Office for Civil Rights | Within 60 days                   |
|                      | Notify prominent media outlet      | Within 60 days                   |
|                      | Notify covered entity client       | Immediately (within 24-48 hours) |

**Exceptions**: If law enforcement requests delay, may postpone notification by up to 30 days.

---

## 10. COMPLIANCE AND ENFORCEMENT

### 10.1 Policy Violations

**Examples of Policy Violations:**

- Sharing passwords with others
- Using unencrypted email to send PHI
- Accessing data without business need (snooping)
- Failure to report security incident
- Leaving device unlocked in public place
- Storing client data on personal device without encryption

**Consequences** (progressive discipline):

1. **First Violation (Minor)**: Verbal warning, retraining
2. **Second Violation or Moderate Violation**: Written warning, retraining, access restriction
3. **Serious or Repeated Violation**: Suspension of access, termination of employment/contract
4. **Willful Violation**: Immediate termination, legal action, report to authorities

**Factors Considered:**

- Intent (accidental vs. intentional)
- Severity of potential harm
- Prior violations
- Cooperation with investigation

### 10.2 Employee/Contractor Acknowledgment

**All personnel must sign:**

- **Data Security Policy Acknowledgment**: Annual certification of Policy review
- **Confidentiality Agreement**: Upon hire/engagement
- **HIPAA Training Certification**: If handling PHI (annual)

**Form maintained in personnel file for audit purposes.**

### 10.3 Audit and Monitoring

**Internal Audits:**

- **Frequency**: Annually or after significant changes
- **Scope**: Review access logs, test security controls, interview personnel
- **Deliverable**: Audit report with findings and recommendations

**Continuous Monitoring:**

- Review access logs quarterly (look for anomalies)
- Monitor failed login attempts (alert on excessive failures)
- Review cloud service dashboards (AWS CloudTrail, Azure Monitor)
- Analyze network traffic for unusual patterns

**External Audits:**

- Engage third-party cybersecurity firm for penetration testing (every 2 years)
- HIPAA audit if required by covered entity client
- ISO 27001 or SOC 2 audit if pursuing certification

### 10.4 Policy Updates

**This Policy will be reviewed and updated:**

1. **Annually**: Scheduled review by Security Officer and legal counsel
2. **After Incidents**: Update after security incident or near-miss
3. **Legal Changes**: Update when laws change (new privacy law, HIPAA updates)
4. **Technology Changes**: Update when adopting new tools or platforms
5. **Business Changes**: Update when expanding services or entering new industries

**Update Process:**

1. Draft proposed changes
2. Legal review (if substantive changes)
3. Notify all personnel of changes
4. Obtain signed acknowledgment of updated Policy
5. Update effective date and version number

---

## 11. CONTACT INFORMATION

### 11.1 Security Officer

**Name**: [Brett Weaver]
**Title**: Privacy and Security Officer
**Email**: [SECURITY EMAIL TO BE ADDED]
**Phone**: [PHONE TO BE ADDED]
**Emergency Line**: [24/7 LINE FOR CRITICAL INCIDENTS]

### 11.2 Reporting Security Incidents

**Email**: [SECURITY EMAIL]
**Subject Line**: "SECURITY INCIDENT - [Brief Description]"
**Expected Response Time**: Within 1 hour during business hours; 4 hours after-hours

### 11.3 External Resources

**Legal Counsel**: [Attorney name, firm, phone]
**Cybersecurity Consultant**: [Firm, contact, emergency line]
**Cyber Liability Insurance**: [Carrier, policy number, claims hotline]
**FBI Cyber Division**: [Minneapolis field office contact or 1-800-CALL-FBI]

---

## APPENDICES

### Appendix A: Glossary

**AES-256**: Advanced Encryption Standard with 256-bit key (symmetric encryption)
**Business Associate (BA)**: Entity that performs services for covered entity involving PHI (HIPAA)
**Covered Entity**: Healthcare provider, health plan, or clearinghouse (HIPAA)
**Encryption**: Converting data into unreadable format without decryption key
**MFA**: Multi-Factor Authentication (two or more authentication factors)
**PHI**: Protected Health Information (health data that can identify an individual)
**PII**: Personally Identifiable Information (name, SSN, address, etc.)
**TLS**: Transport Layer Security (encryption protocol for internet communications)
**VPN**: Virtual Private Network (encrypted tunnel for internet traffic)

### Appendix B: Incident Response Checklist

**[See separate Incident Response Checklist document]**

Quick reference checklist for responding to security incidents.

### Appendix C: Employee Acknowledgment Form

**[See separate Acknowledgment Form]**

Template for annual Policy acknowledgment by personnel.

### Appendix D: Third-Party Vendor Security Questionnaire

**[See separate Vendor Questionnaire]**

Standard questions to assess vendor security practices before engagement.

### Appendix E: HIPAA-Specific Procedures

**[See separate HIPAA Procedures document]**

Detailed procedures for handling PHI, breach notification, patient rights.

---

## ATTORNEY REVIEW CHECKLIST

**Before implementing this Policy:**

- [ ] Attorney reviews for compliance with federal and Minnesota law
- [ ] HIPAA provisions reviewed by healthcare attorney (if handling PHI)
- [ ] Cybersecurity professional reviews technical safeguards
- [ ] Insurance broker confirms cyber liability coverage adequacy
- [ ] Policy aligned with vendor contracts (BAAs, DPAs)
- [ ] Retention periods comply with legal requirements
- [ ] Breach notification procedures comply with Minn. Stat. § 325M and HIPAA
- [ ] Employee/contractor acknowledgment forms reviewed
- [ ] Incident response plan tested (tabletop exercise)
- [ ] All appendices completed and attached

**Technical Verification:**

- [ ] Inventory all systems handling sensitive data
- [ ] Verify encryption enabled on all devices and services
- [ ] Confirm MFA enabled on critical systems
- [ ] Test backup restoration
- [ ] Review access permissions (least privilege)
- [ ] Conduct risk assessment

**Attorney Notes:**

[Space for legal counsel comments and required changes]

---

**Document Control:**

- **Version**: 1.0 DRAFT
- **Created**: January 29, 2026
- **Status**: ⚠️ PENDING ATTORNEY AND TECHNICAL REVIEW
- **Owner**: GFV LLC DBA Good Flippin Design
- **Custodian**: Brett Weaver (Security Officer)
- **Next Review**: [Date after attorney approval]

---

**END OF DATA SECURITY AND PRIVACY POLICY (DRAFT)**

_This policy is a working draft and must not be implemented or relied upon until reviewed and approved by legal counsel and a qualified cybersecurity professional._
