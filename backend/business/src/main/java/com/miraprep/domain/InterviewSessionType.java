package com.miraprep.domain;

/** 区分正式面试与单题重练，避免练习数据混入正式统计。 */
public enum InterviewSessionType {
    INTERVIEW,
    PRACTICE
}
