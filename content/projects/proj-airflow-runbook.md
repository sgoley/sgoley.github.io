---
title: Runbook for Airflow
author: Scott Goley
status: published
published: 2026-09-22
tags: [ios, swift, swiftui, apache-airflow, devops, monitoring]
shelf: open
part: Built
outcome: A native iOS client for Airflow health, run details, and confirmed DAG triggers, including an offline demo.
proof_label: Live
proof_url: /AirflowRunbook/
---

Runbook is a native iOS companion for Apache Airflow. Monitor instance health, review DAG run details, and explicitly trigger new runs directly from iPhone and iPad, complete with a synthetic demo workspace for offline evaluation.

## What it does

- See Airflow instance health and recent run summaries.
- Drill into DAG run details and task states.
- Explicitly trigger new DAG runs with confirmation.
- Connect directly to your Airflow URL over HTTPS.

## Built with

- Swift and SwiftUI
- iOS Keychain credential storage
- Direct Airflow REST API v1/v2 calls
- Synthetic demo workspace for offline evaluation

## Links

- [Live product site](/AirflowRunbook/)
- [Source on GitHub](https://github.com/sgoley/AirflowRunbook)
