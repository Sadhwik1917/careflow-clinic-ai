# CAREFLOW AI — Technical Architecture & Development Specification v1.3

**Document Status:** Development Source of Truth  
**Product:** CAREFLOW AI  
**Version:** 1.3  
**Platform:** Web Application  
**Primary Technology:** Lovable + React + Node.js + Supabase + Gemini + GitHub  
**Architecture:** Multi-tenant SaaS  
**Target Users:** Clinics, clinic owners, doctors, staff, and patients

---

## 1. Product Overview

**CAREFLOW AI** is a web-based Clinic Operations & Patient Management Platform designed to help small and medium-sized clinics manage their daily workflow from a single system.

CAREFLOW AI connects:

> **Clinic → Staff → Patient → Appointment → Check-in → Queue → Consultation → Prescription → Billing → Payment → Patient History**

AI is an **assistive capability**, not a medical decision-maker.

### CAREFLOW AI should NOT:

- Diagnose patients
- Recommend treatments independently
- Replace doctors
- Make medical decisions
- Automatically modify medical records without human review

### CAREFLOW AI should:

- Reduce administrative workload
- Organize clinic operations
- Improve patient workflow
- Summarize information
- Assist doctors and clinic owners
- Provide operational insights

---

# 2. Business Model

CAREFLOW AI is a **B2B SaaS product**.

### Customer

**Clinic Owner**

The clinic owner pays CAREFLOW AI for using the platform.

### Clinic's customers

**Patients**

Patients pay the clinic owner for consultations/services.

Therefore:

```text
CAREFLOW AI
     │
     │ Subscription payment
     ▼
Clinic Owner
     │
     │ Consultation/service payment
     ▼
Patient
```

These two financial flows must remain completely separate in the database.

---

# 3. Target Market

Initial target:

- Small clinics
- Medium-sized clinics
- Outpatient clinics
- General physician clinics
- Dental clinics
- Dermatology clinics
- Physiotherapy clinics
- Pediatric clinics
- Other specialty clinics

CAREFLOW AI is **not initially designed as a hospital-management/EHR replacement**.

---

# 4. User Roles

CAREFLOW AI has five primary roles.

| Role             | Responsibility                    |
| ---------------- | --------------------------------- |
| `PLATFORM_ADMIN` | Manages CAREFLOW platform         |
| `OWNER`          | Clinic owner/customer             |
| `DOCTOR`         | Provides clinical services        |
| `STAFF`          | Handles clinic operations         |
| `PATIENT`        | Accesses their clinic information |

### Important principle

A user's **platform identity** and **clinic role** are separate.

For example:

```text
users
   ↓
clinic_members
   ↓
OWNER / DOCTOR / STAFF
```

This allows the same person to potentially belong to multiple clinics.

---

# 5. Multi-Tenant Architecture

CAREFLOW AI is a **multi-tenant application**.

A clinic represents a tenant.

Every clinic-owned record must contain:

```text
clinicId
```

Example:

```text
Clinic A
 ├── Patients
 ├── Appointments
 ├── Doctors
 ├── Staff
 └── Billing

Clinic B
 ├── Patients
 ├── Appointments
 ├── Doctors
 ├── Staff
 └── Billing
```

Clinic A must **never** access Clinic B's data.

Security requires both:

```text
User authentication
        +
Clinic membership
        +
Role permission
```

UI-level restrictions alone are not considered security.

---

# 6. Technology Architecture

## Frontend

- React
- TypeScript
- Responsive web UI
- Reusable component system
- Role-based layouts

## Backend

- Node.js
- Server-side business logic
- Supabase Admin SDK where required
- Secure AI calls
- Subscription/entitlement enforcement

## Authentication

- Supabase Authentication
- Email/password
- Future OAuth providers if required

## Database

- Cloud Supabase DB

## AI

- Google Gemini
- AI calls through the backend
- Controlled context retrieval

## File Storage

- Supabase Storage when required

## Version Control

- GitHub

---

# 7. High-Level Architecture

```text
                    CAREFLOW AI
                         │
          ┌──────────────┴──────────────┐
          │                             │
      React Frontend              Node.js Backend
          │                             │
          │                    ┌────────┴─────────┐
          │                    │                  │
          ▼                    ▼                  ▼
     Supabase Auth         Supabase DB          Gemini
          │                    │                  │
          └────────────────────┴──────────────────┘
                               │
                         Supabase Storage
```

---

# 8. Authentication Architecture

Authentication identifies **who the user is**.

Authorization determines **what the user can do**.

### Authentication flow

```text
Signup
 ↓
Supabase Authentication
 ↓
Create users/{userId}
 ↓
Select/complete subscription
 ↓
Create clinic
 ↓
Create clinic_members membership
 ↓
Clinic onboarding
 ↓
Dashboard
```

---

# 9. User Collection

### `users/{userId}`

```text
userId
email
displayName
phone
photoUrl
platformRole
status
createdAt
updatedAt
lastLoginAt
```

`platformRole`:

```text
USER
PLATFORM_ADMIN
```

Clinic roles are **not stored here**.

---

# 10. Clinic Architecture

### `clinics/{clinicId}`

```text
clinicId
name
clinicCode
ownerUserId
phone
email
address
city
state
country
timezone
currency
logoUrl
status
workingHours
onboardingStatus
onboardingStep
createdAt
updatedAt
```

---

# 11. Clinic Membership

### `clinic_members/{membershipId}`

```text
membershipId
clinicId
userId
role
status
joinedAt
createdAt
updatedAt
```

Roles:

```text
OWNER
DOCTOR
STAFF
```

This is the main relationship:

```text
User
  │
  ├── Clinic A → OWNER
  │
  └── Clinic B → DOCTOR
```

---

# 12. Clinic Invitations

### `clinic_invitations/{invitationId}`

```text
invitationId
clinicId
email
role
invitedBy
status
expiresAt
createdAt
```

Statuses:

```text
PENDING
ACCEPTED
EXPIRED
CANCELLED
```

---

# 13. Doctor Architecture

A separate doctor profile is required because doctors have professional information beyond normal user information.

### `doctor_profiles/{doctorProfileId}`

```text
doctorProfileId
userId
clinicId
specialization
department
qualification
experienceYears
licenseNumber
consultationFee
bio
availability
status
createdAt
updatedAt
```

### Architecture

```text
users
  │
  └── clinic_members
          │
          └── DOCTOR
                │
                └── doctor_profiles
```

This separates:

**User identity → Clinic role → Professional information**

---

# 14. Patient Architecture

### `patients/{patientId}`

```text
patientId
clinicId
userId
patientNumber
firstName
lastName
dateOfBirth
gender
phone
email
address
emergencyContactName
emergencyContactPhone
notes
status
createdAt
updatedAt
```

`userId` can initially be `null`.

This allows staff to register a patient without requiring the patient to create a CAREFLOW account.

---

# 15. Appointment Architecture

### `appointments/{appointmentId}`

```text
appointmentId
clinicId
patientId
doctorId
appointmentDate
startTime
endTime
type
reason
status
notes
createdBy
createdAt
updatedAt
```

Statuses:

```text
REQUESTED
CONFIRMED
CHECKED_IN
IN_QUEUE
IN_CONSULTATION
COMPLETED
CANCELLED
NO_SHOW
```

---

# 16. Queue Management

### `queue_entries/{queueEntryId}`

```text
queueEntryId
clinicId
appointmentId
patientId
doctorId
queueDate
queueNumber
status
checkedInAt
calledAt
consultationStartedAt
completedAt
createdAt
updatedAt
```

Statuses:

```text
WAITING
CALLED
IN_CONSULTATION
COMPLETED
SKIPPED
NO_SHOW
```

---

# 17. Consultation Architecture

### `consultations/{consultationId}`

```text
consultationId
clinicId
appointmentId
patientId
doctorId
chiefComplaint
clinicalNotes
assessment
followUpNotes
followUpDate
status
createdAt
updatedAt
completedAt
```

Statuses:

```text
DRAFT
COMPLETED
```

---

# 18. Vitals

### `vitals/{vitalId}`

```text
vitalId
clinicId
patientId
appointmentId
consultationId
temperature
bloodPressureSystolic
bloodPressureDiastolic
heartRate
respiratoryRate
oxygenSaturation
weight
height
recordedBy
recordedAt
```

---

# 19. Prescription

### `prescriptions/{prescriptionId}`

```text
prescriptionId
clinicId
patientId
doctorId
consultationId
prescriptionDate
instructions
status
createdAt
updatedAt
```

### `prescription_items/{itemId}`

```text
itemId
prescriptionId
medicineName
dosage
frequency
duration
instructions
```

---

# 20. Clinic Billing

### `invoices/{invoiceId}`

```text
invoiceId
clinicId
patientId
appointmentId
invoiceNumber
subtotal
discount
tax
totalAmount
amountPaid
amountDue
status
issuedAt
createdBy
updatedAt
```

Statuses:

```text
DRAFT
PENDING
PARTIAL
PAID
CANCELLED
```

### `invoice_items/{itemId}`

```text
itemId
invoiceId
description
quantity
unitPrice
total
```

### `payments/{paymentId}`

```text
paymentId
clinicId
patientId
invoiceId
amount
paymentMethod
transactionReference
status
paidAt
recordedBy
createdAt
```

Payment methods:

```text
CASH
CARD
UPI
OTHER
```

---

# 21. CAREFLOW Subscription Architecture

CAREFLOW's subscription system is separate from clinic billing.

### `plans/{planId}`

```text
planId
name
description
clinicMode
aiEnabled
aiCreditType
aiCreditLimit
maxClinics
maxDoctors
maxStaff
features
price
currency
billingCycle
trialEnabled
trialDurationDays
requiresPaymentMandate
isActive
createdAt
updatedAt
```

---

# 22. Five Pricing Plans

### Plan 1 — AI Clinic

```text
Single Clinic
AI Enabled
Limited AI Credits
```

### Plan 2 — Clinic

```text
Single Clinic
AI Disabled
```

### Plan 3 — AI Multi Clinic

```text
Multiple Clinics
AI Enabled
Limited AI Credits
```

### Plan 4 — Multi Clinic

```text
Multiple Clinics
AI Disabled
```

### Plan 5 — Max AI

```text
Single / Multi Clinic
AI Enabled
Unlimited AI Credits
```

Max AI includes:

```text
Single Clinic
      ↕
Multi Clinic
```

through a UI toggle.

---

# 23. Subscription

### `clinic_subscriptions/{subscriptionId}`

```text
subscriptionId
clinicId
planId
status
subscriptionType
trialStartDate
trialEndDate
trialCancelledAt
autoRenew
paymentMandateId
paymentProvider
billingCycle
amount
currency
nextBillingDate
startDate
renewalDate
cancelledAt
createdAt
updatedAt
```

---

# 24. Trial Architecture

Selected plans receive a:

**21-day free trial**

Eligible:

- Plan 1
- Plan 3
- Plan 5

Trial requires a payment mandate.

```text
Choose Plan
     ↓
Create Account
     ↓
Payment Mandate
     ↓
Mandate Confirmed
     ↓
21-Day Trial
     ↓
Day 18 Reminder
     ↓
Trial Ends
     ↓
Auto Charge
     ↓
ACTIVE
```

No payment is collected during the trial.

---

# 25. Trial Events

### `trial_events/{eventId}`

```text
eventId
subscriptionId
clinicId
eventType
eventDate
metadata
createdAt
```

Events:

```text
TRIAL_STARTED
MANDATE_CREATED
TRIAL_EXPIRY_REMINDER_SENT
TRIAL_CANCELLED
TRIAL_EXPIRED
TRIAL_CONVERTED
PAYMENT_SUCCESS
PAYMENT_FAILED
```

---

# 26. AI Usage

### `ai_usage/{usageId}`

```text
usageId
clinicId
userId
feature
creditsUsed
periodStart
periodEnd
createdAt
```

Limited AI plans:

```text
Used / Limit / Remaining
```

Max AI:

```text
Unlimited customer credits
```

Usage should still be internally tracked for cost monitoring.

---

# 27. Platform Payments

### `platform_payments/{paymentId}`

Stores payments made by **clinic owners to CAREFLOW**.

This must remain separate from:

```text
invoices
payments
```

which represent money paid by patients to clinics.

---

# 28. Notifications

### `notifications/{notificationId}`

```text
notificationId
recipientUserId
clinicId
type
title
message
relatedEntityType
relatedEntityId
isRead
createdAt
```

Potential notifications:

- Appointment reminder
- Patient check-in
- Queue update
- Payment notification
- Trial expiry reminder
- Subscription payment failure
- Invitation
- AI usage warning

---

# 29. Audit Logs

### `audit_logs/{auditLogId}`

```text
auditLogId
clinicId
userId
action
entityType
entityId
timestamp
metadata
```

Examples:

```text
PATIENT_CREATED
PATIENT_UPDATED
CONSULTATION_CREATED
CONSULTATION_COMPLETED
PRESCRIPTION_CREATED
INVOICE_CREATED
PAYMENT_RECORDED
STAFF_INVITED
STAFF_DEACTIVATED
```

Audit logs are important for accountability and security.

---

# 30. AI Architecture

Initial AI features:

### 1. Consultation Summary

Doctor completes consultation → AI generates a concise summary → doctor reviews → doctor decides whether to use/save it.

### 2. Patient History Summary

AI summarizes relevant historical information for the doctor.

### 3. Daily Clinic Summary

AI summarizes operational activity for the clinic owner.

---

# 31. AI Data Flow

```text
User
 ↓
CAREFLOW Backend
 ↓
Authentication
 ↓
Authorization
 ↓
Retrieve Required Data
 ↓
Minimize Context
 ↓
Gemini
 ↓
Validate Response
 ↓
Human Review
 ↓
User
```

Gemini must **not receive unrestricted database access**.

---

# 32. AI Safety Rules

AI must not:

- Diagnose
- Prescribe independently
- Make medical decisions
- Automatically alter patient records
- Automatically approve financial transactions

AI output should be treated as **assistance**, not authoritative medical advice.

---

# 33. Core User Journey

### Clinic Owner

```text
Website
 ↓
Pricing
 ↓
Choose Plan
 ↓
Signup
 ↓
Subscription / Trial
 ↓
Create Clinic
 ↓
Clinic Onboarding
 ↓
Invite Doctor/Staff
 ↓
Dashboard
```

### Clinic Staff

```text
Login
 ↓
Patient Registration
 ↓
Appointment
 ↓
Check-in
 ↓
Queue
 ↓
Billing
```

### Doctor

```text
Login
 ↓
Today's Appointments
 ↓
Patient Queue
 ↓
Consultation
 ↓
Vitals
 ↓
Clinical Notes
 ↓
Prescription
 ↓
Follow-up
 ↓
Complete
```

### Patient

```text
Patient Registration
 ↓
Optional Portal Invitation
 ↓
Login
 ↓
Appointments
 ↓
Prescriptions
 ↓
Bills
 ↓
History
```

---

# 34. Core Pages

## Public

```text
/
 /pricing
 /about
 /contact
 /login
 /signup
```

## Owner

```text
/clinic/dashboard
/clinic/patients
/clinic/patients/new
/clinic/patients/:patientId
/clinic/appointments
/clinic/appointments/new
/clinic/queue
/clinic/doctors
/clinic/staff
/clinic/billing
/clinic/billing/new
/clinic/reports
/clinic/ai
/clinic/settings
```

## Doctor

```text
/doctor/dashboard
/doctor/appointments
/doctor/patients
/doctor/consultations
/doctor/prescriptions
/doctor/profile
```

## Staff

```text
/staff/dashboard
/staff/patients
/staff/appointments
/staff/queue
/staff/billing
/staff/profile
```

## Patient

```text
/patient/dashboard
/patient/appointments
/patient/prescriptions
/patient/bills
/patient/history
/patient/profile
```

## Platform Admin

```text
/admin/dashboard
/admin/clinics
/admin/subscriptions
/admin/users
/admin/analytics
/admin/settings
```

---

# 35. RBAC Principle

Authorization must be enforced at the backend/database level.

Example:

```text
Can user access patient?
       ↓
Is authenticated?
       ↓
Is member of patient's clinic?
       ↓
Does role have permission?
       ↓
ALLOW / DENY
```

Never depend only on hiding UI buttons.

---

# 36. Main RBAC Summary

| Feature         |  Owner |               Doctor |   Staff |       Patient |
| --------------- | -----: | -------------------: | ------: | ------------: |
| Patients        |   CRUD | Read/Clinical Update |    CRUD |           Own |
| Appointments    |   CRUD |                  Own |    CRUD |           Own |
| Queue           | Manage |                  Own |  Manage | View relevant |
| Consultation    |   Read |                 CRUD |       — |   Result/View |
| Prescription    |   Read |                 CRUD |    Read |           Own |
| Billing         |   CRUD |                 Read |    CRUD |           Own |
| AI              |    Use |              Limited |       — |             — |
| Clinic Settings |   CRUD |                    — |       — |             — |
| Staff           |   CRUD |                    — |       — |             — |
| Doctors         |   CRUD |             Own/View |    View |          View |
| Reports         |   Read |              Limited | Limited |             — |

---

# 37. Dashboard Requirements

## Owner Dashboard

Must answer:

> **“What is happening in my clinic today?”**

Show:

- Today's patients
- Today's appointments
- Waiting patients
- Completed consultations
- Pending payments
- Revenue
- Quick actions
- Operational alerts

## Doctor Dashboard

Show:

- Today's appointments
- Current queue
- Upcoming patients
- Recent patients
- Pending consultations
- Follow-ups

## Staff Dashboard

Show:

- Today's appointments
- Patient registration
- Queue
- Check-ins
- Billing

---

# 38. Design System

Design direction:

**Professional + trustworthy + modern healthcare SaaS**

The UI should feel:

- Calm
- Organized
- Reliable
- Efficient
- Clean
- Professional

Avoid:

- Excessive futuristic UI
- Overuse of gradients
- Unnecessary animations
- Gaming-style interfaces
- Excessive AI visual effects

---

# 39. Shared Components

Create reusable components:

```text
Button
Input
Select
Modal
Dialog
Table
Search
Pagination
StatusBadge
PatientCard
AppointmentCard
DoctorCard
QueueItem
StatsCard
DatePicker
Notification
EmptyState
LoadingState
ErrorState
```

Do not repeatedly build the same UI component for every module.

---

# 40. Multi-Clinic Context

Owners with multiple clinics need an active clinic context:

```text
User
 ↓
Clinic Selector
 ↓
Active Clinic
 ↓
Dashboard/Data
```

Example:

```text
Dr. Kumar
 ├── Hyderabad Clinic
 └── Secunderabad Clinic
```

Changing the active clinic changes the operational context.

---

# 41. Entitlement Enforcement

Plan limits must be enforced by backend logic.

Examples:

```text
canCreateClinic()
canAddDoctor()
canAddStaff()
canUseAI()
canAccessFeature()
```

Example:

```text
Single Clinic Plan
       ↓
Create second clinic
       ↓
BLOCK
       ↓
Upgrade Prompt
```

---

# 42. Database Principles

The current Supabase DB collection architecture remains unchanged.

We are **not redesigning the database around traditional relational ACID architecture**.

Where business workflows require atomic updates, Supabase DB transactions/batched writes should be used appropriately.

For example:

```text
Appointment
 ↓
Queue Entry
 ↓
Consultation
 ↓
Appointment Completion
```

The existing collection structure should remain intact while implementation uses transactions where necessary.

---

# 43. Financial Separation

CAREFLOW contains two different financial systems.

### CAREFLOW Revenue

```text
plans
clinic_subscriptions
platform_payments
trial_events
```

### Clinic Revenue

```text
invoices
invoice_items
payments
```

**Never mix these systems.**

---

# 44. Security Requirements

Mandatory:

- Supabase Authentication
- Supabase DB Security Rules
- Backend authorization
- Clinic-level data isolation
- Role-based access control
- Server-side AI calls
- Server-side subscription enforcement
- Secure invitation tokens
- Expiring invitations
- Audit logging
- No secrets in GitHub
- No real API keys in frontend code

Sensitive payment credentials such as:

```text
Card number
CVV
UPI PIN
Bank credentials
```

must never be stored by CAREFLOW.

---

# 45. GitHub Architecture

Repository:

```text
careflow-ai/
│
├── README.md
├── docs/
│   ├── product-blueprint.md
│   ├── architecture.md
│   ├── database.md
│   ├── user-flows.md
│   ├── ai-specification.md
│   └── development-rules.md
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── services/
│   ├── hooks/
│   ├── utils/
│   └── types/
│
├── server/
├── Supabase/
└── public/
```

---

# 46. Git Branch Strategy

```text
main
  │
  └── develop
        │
        ├── feature/auth
        ├── feature/patients
        ├── feature/appointments
        ├── feature/doctor-consultation
        ├── feature/billing
        └── feature/ai
```

Rules:

- No direct development on `main`
- Features developed on feature branches
- Pull Request before merge
- Review before merging
- Test before merge

---

# 47. Three-Person Team Ownership

### Member 1 — Clinic Operations

Responsible for:

- Patients
- Appointments
- Reception
- Check-in
- Queue

### Member 2 — Clinical Workflow

Responsible for:

- Doctor dashboard
- Consultation
- Medical history
- Prescription
- Follow-up
- Patient portal

### Member 3 — Product/Technical Lead

Responsible for:

- Architecture
- Authentication
- RBAC
- Clinic onboarding
- Subscription
- Owner dashboard
- Billing architecture
- AI
- Integration
- GitHub coordination
- Final QA

---

# 48. Development Phases

## Phase 1 — Foundation

- Project setup
- Supabase
- Authentication
- Routing
- Design system
- GitHub integration
- RBAC foundation

## Phase 2 — Clinic Setup

- Clinic creation
- Clinic onboarding
- Doctor profiles
- Staff
- Invitations
- Working hours

## Phase 3 — Clinic Operations

- Patients
- Appointments
- Check-in
- Queue

## Phase 4 — Clinical Workflow

- Doctor dashboard
- Consultation
- Vitals
- Prescription
- Follow-up
- Patient history

## Phase 5 — Billing

- Invoices
- Invoice items
- Payments
- Billing dashboard

## Phase 6 — Patient Portal

- Patient login
- Appointments
- Prescriptions
- Bills
- History

## Phase 7 — AI

- Consultation summary
- Patient history summary
- Daily clinic summary
- AI usage tracking

## Phase 8 — SaaS

- Pricing
- Subscription
- Trial
- Mandate
- Payment
- Entitlements

## Phase 9 — Production Hardening

- Security testing
- RBAC testing
- Tenant isolation
- E2E testing
- Error handling
- Performance
- Responsive testing
- Final QA

---

# 49. Lovable Generation Strategy

**Do not generate the entire CAREFLOW application in one prompt.**

Generation order:

```text
1. Foundation
        ↓
2. Authentication + RBAC
        ↓
3. Clinic onboarding
        ↓
4. Patients + Appointments + Queue
        ↓
5. Doctor + Consultation
        ↓
6. Prescription
        ↓
7. Billing
        ↓
8. Patient Portal
        ↓
9. AI
        ↓
10. Testing + Security
```

Each generation must respect the existing architecture.

---

# 50. Lovable Development Rule

Before modifying an existing module:

1. Check current GitHub code.
2. Understand existing architecture.
3. Identify affected files.
4. Make the smallest required change.
5. Review generated code.
6. Test.
7. Commit to feature branch.
8. Create PR.

AI-generated code must **not automatically overwrite another developer's work**.

---

# 51. Testing Strategy

Testing must cover:

### Authentication

- Signup
- Login
- Logout
- Invalid credentials
- Session persistence

### Authorization

- Owner access
- Doctor access
- Staff access
- Patient access
- Unauthorized access

### Multi-tenancy

```text
Clinic A → cannot access Clinic B
```

### Workflow

```text
Patient
 ↓
Appointment
 ↓
Check-in
 ↓
Queue
 ↓
Consultation
 ↓
Prescription
 ↓
Invoice
 ↓
Payment
```

### Subscription

- Trial start
- Trial cancellation
- Trial expiry
- Payment success
- Payment failure
- Entitlement limits
- Upgrade

### AI

- Authorization
- Correct context
- Usage limits
- Invalid responses
- Human review

---

# 52. MVP Definition of Done

CAREFLOW AI V1 is considered MVP-ready when:

- Authentication works
- Clinic onboarding works
- RBAC works
- Multi-tenant isolation works
- Owner can manage clinic
- Staff can register patients
- Appointments work
- Queue works
- Doctor can complete consultation
- Prescription works
- Billing works
- Patient portal works
- Subscription architecture works
- AI assistant works within defined limits
- Audit logging works
- Responsive UI works
- Core E2E workflow passes
- No critical security issues remain

---

# 53. Primary End-to-End Acceptance Test

The most important MVP test is:

```text
Clinic Owner
      ↓
Creates CAREFLOW Account
      ↓
Selects Plan
      ↓
Completes Subscription/Trial
      ↓
Creates Clinic
      ↓
Adds Doctor + Staff
      ↓
Staff Registers Patient
      ↓
Creates Appointment
      ↓
Patient Checks In
      ↓
Patient Enters Queue
      ↓
Doctor Starts Consultation
      ↓
Doctor Records Vitals/Notes
      ↓
Doctor Creates Prescription
      ↓
Consultation Completed
      ↓
Invoice Created
      ↓
Payment Recorded
      ↓
Patient History Updated
      ↓
Owner Sees Dashboard Activity
```

**If this workflow works reliably, CAREFLOW has its core MVP foundation.**

---

# 54. Current Pending Work

The next implementation priorities are:

### P0 — Foundation

- [ ] Finalize technical specification
- [ ] Lovable project setup
- [ ] Supabase setup
- [ ] GitHub repository
- [ ] Authentication
- [ ] Base routing
- [ ] Design system
- [ ] RBAC foundation

### P1 — Core Workflow

- [ ] Clinic onboarding
- [ ] Doctor profiles
- [ ] Staff invitations
- [ ] Patient management
- [ ] Appointments
- [ ] Queue
- [ ] Consultation
- [ ] Prescription
- [ ] Billing

### P2 — SaaS

- [ ] Pricing UI
- [ ] Subscription
- [ ] 21-day trial
- [ ] Payment mandate
- [ ] Entitlements
- [ ] AI usage limits

### P3 — AI & Production

- [ ] Consultation summary
- [ ] Patient history summary
- [ ] Daily clinic summary
- [ ] Notifications
- [ ] Audit testing
- [ ] Security testing
- [ ] E2E testing
- [ ] Production deployment

---

# 55. Architecture Decision Summary

The following decisions are **locked for V1**:

| Decision                 | V1 Choice                      |
| ------------------------ | ------------------------------ |
| Product                  | CAREFLOW AI                    |
| Business model           | B2B SaaS                       |
| Customer                 | Clinic Owner                   |
| Database                 | Supabase DB                    |
| Authentication           | Supabase Auth                  |
| Frontend                 | React                          |
| Backend                  | Node.js                        |
| AI                       | Gemini                         |
| Architecture             | Multi-tenant                   |
| Clinic isolation         | `clinicId`                     |
| Clinic roles             | `clinic_members`               |
| Doctor professional data | `doctor_profiles`              |
| Patient auth             | Optional initially             |
| AI role                  | Assistive, human-reviewed      |
| Trial                    | 21 days                        |
| Trial plans              | 1, 3, 5                        |
| Max AI                   | Unlimited credits              |
| Billing separation       | CAREFLOW vs Clinic             |
| Version control          | GitHub                         |
| Development              | Incremental Lovable generation |

---

## Final Architecture Principle

> **CAREFLOW AI should remain a simple, secure, multi-tenant clinic workflow platform first, with AI layered on top as an assistant — not an AI system with a clinic application built around it.**

This **v1.3 document should be treated as the source of truth** while we move into Lovable implementation.

---
