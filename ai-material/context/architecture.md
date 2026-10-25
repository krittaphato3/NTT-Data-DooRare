# Architecture

## Deployed AWS Production Stack (DooRare)

```mermaid
flowchart TB
  subgraph Users["ผู้ใช้งาน (Health Region 6)"]
    U1["แพทย์ / พยาบาล ER"]
    U2["เภสัชกร / คลังยา"]
    U3["ผู้บริหาร / Admin"]
  end

  subgraph Edge["Edge & Security Layer"]
    CF["Amazon CloudFront<br/>(CDN / HTTPS / Caching)"]
    S3["Amazon S3<br/>(Frontend Web Assets)"]
    COG["Amazon Cognito User Pool<br/>(OIDC / SSO / MFA)"]
  end

  subgraph Compute["Compute Layer (AWS VPC)"]
    EC2["Amazon EC2 (47.128.218.90)<br/>Docker: doorare-backend (Node.js/Express)"]
  end

  subgraph Data["Database & External Services"]
    RDS[("Amazon RDS PostgreSQL 16<br/>(doorare-db / SSL Encrypted)")]
    LOC["Amazon Location Service v2<br/>(Routes API / Driving Matrix)"]
    CW["AWS CloudWatch<br/>(Metrics / Logs / Alarms)"]
  end

  %% Flow lines
  U1 & U2 & U3 -->|HTTPS| CF
  CF -->|Static Web| S3
  CF -->|API Requests /api/v1/*| EC2
  U1 & U2 & U3 -.->|SSO Authentication| COG
  COG -.->|JWT / User Info| EC2
  EC2 -->|Query / SSL| RDS
  EC2 -->|Calculate Routes| LOC
  EC2 -.->|Fallback if Offline| HAV["Haversine Formula<br/>(Road Factor 1.35)"]
  EC2 -.->|Metrics / Telemetry| CW
  COG -.->|Auth Metrics| CW
  RDS -.->|Database Metrics| CW
```

- **Frontend:** React + Vite SPA, hosted on S3 and served via CloudFront CDN (`https://d27x5bphqn4glk.cloudfront.net`).
- **Auth:** AWS Cognito User Pool (`us-east-1_Yqc7bshFl`) with OIDC authorization code flow.
- **Backend:** Node.js Express REST API on EC2 container, handling business logic, borrow ladders, and forecasts.
- **Database:** AWS RDS PostgreSQL 16 (`doorare-db`) with SSL TLS enforcement (`rejectUnauthorized: false`).
- **Routing:** Amazon Location Service v2 Routes API with automated Haversine fallback (1.35 tortuosity factor).
- **Monitoring:** AWS CloudWatch tracking EC2, RDS, and Cognito User Pool events.
