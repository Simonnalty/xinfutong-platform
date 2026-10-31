<template>
  <div class="page" v-if="data">
    <div class="page-head">
      <div>
        <div class="row" style="align-items:center;margin-bottom:6px">
          <el-button text :icon="ArrowLeft" @click="$router.push('/app/dashboard')">返回</el-button>
          <span class="level-badge" :class="data.case.level">{{ data.case.levelLabel }}</span>
          <span class="mono muted">{{ data.case.id }}</span>
        </div>
        <h1 style="margin:0">{{ data.case.event }}</h1>
        <div class="sub">{{ data.enterprise.name }} · {{ data.case.authority }} · {{ data.case.doc_no }}</div>
      </div>
      <div class="row">
        <el-button :icon="Refresh" @click="reload">刷新</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="case-tabs">
      <!-- 诊断 -->
      <el-tab-pane label="智能诊断" name="diagnose">
        <div class="card card-pad">
          <div v-if="rule.support" class="spread" style="align-items:center;margin-bottom:14px">
            <div style="display:flex;gap:10px;align-items:center">
              <span style="font-size:15px;font-weight:600">{{ rule.support.label }}</span>
              <el-tag size="small" :type="rule.support.autoJudgeable ? 'success' : 'warning'" effect="plain">{{ rule.support.supportLabel }}</el-tag>
            </div>
            <a v-if="rule.support.channel" :href="rule.support.channel.url" target="_blank" rel="noopener noreferrer" class="tiny">{{ rule.support.channel.name }} 官方入口 →</a>
          </div>

          <!-- 轻微失信：公示期满由机关停止公示，企业无需申请 -->
          <el-alert v-if="rule.autoStopOnly" type="success" :closable="false" show-icon style="margin-bottom:16px">
            <template #title>本情形无需申请：公示期满由作出决定的机关直接停止公示</template>
            <div class="tiny" style="line-height:2">
              依《市场监督管理信用修复管理办法》第七条，仅受到警告的行政处罚信息不予公示；仅受到通报批评、仅受到较低数额罚款的，公示期满三个月由市场监督管理部门停止公示。
            </div>
            <div class="tiny" style="line-height:2">
              按登记日期推算，预计停止公示日为 <strong>{{ rule.applyFrom || '待定' }}</strong>。企业不需要提交信用修复申请，提交了也不会被受理。
            </div>
            <div class="tiny" style="line-height:2">
              请到「信用中国」核对公示状态；届满仍未停止公示的，再向作出决定的机关反映，或按渠道差异生成异议草稿。
            </div>
          </el-alert>

          <!-- 指引支持 / 仅导航：不做判定，只给说明与入口 -->
          <el-alert v-if="rule.support && !rule.support.autoJudgeable" type="warning" :closable="false" show-icon>
            <template #title>该类情形暂不提供自动判定</template>
            <div class="tiny" style="line-height:2">{{ rule.support.note }}</div>
            <div class="tiny" style="line-height:2">受理机关：{{ rule.support.authority }}</div>
            <div class="tiny" style="line-height:2">平台不判断可申请时间，也不代为生成正式文书；请以受理机关的公开要求为准。</div>
          </el-alert>

          <div v-else class="verdict">
            <div>
              <div class="score-ring" :style="{ '--p': rule.score }">
                <div class="num">{{ rule.score }}</div>
                <div class="cap">材料完备度</div>
              </div>
              <div class="center" style="margin-top:14px">
                <el-button type="primary" plain size="small" :loading="diagnosing" @click="rediagnose">重新诊断</el-button>
                <el-button size="small" @click="openFacts">补充事实</el-button>
              </div>
            </div>
            <div>
              <div style="display:flex;gap:26px;flex-wrap:wrap;margin-bottom:16px">
                <div>
                  <div class="muted tiny">失信等级</div>
                  <div style="font-size:18px;font-weight:600">{{ rule.levelLabel }}</div>
                </div>
                <div>
                  <div class="muted tiny">{{ rule.autoStopOnly ? '预计停止公示日' : '可申请修复日' }}</div>
                  <div style="font-size:18px;font-weight:600" :style="{ color: rule.autoStopOnly || rule.eligible ? 'var(--ok)' : 'var(--warn)' }">
                    {{ rule.applyFrom || '待定' }}
                  </div>
                </div>
                <div>
                  <div class="muted tiny">状态</div>
                  <div style="font-size:18px;font-weight:600" :style="{ color: rule.status === 'eligible' ? 'var(--ok)' : rule.status === 'blocked' ? 'var(--bad)' : 'var(--warn)' }">
                    {{ statusText }}
                  </div>
                </div>
                <div>
                  <div class="muted tiny">法定办理时限</div>
                  <div style="font-size:18px;font-weight:600">{{ rule.reviewDays ? rule.reviewDays + ' 个工作日（参考）' : '待核对适用规则' }}</div>
                </div>
              </div>

              <div class="cond-list">
                <div class="cond" v-for="c in rule.conditions" :key="c.key">
                  <el-icon :size="18" :color="c.state === 'met' ? '#1E8449' : c.state === 'unmet' ? '#B03A2E' : '#B9770E'">
                    <component :is="c.state === 'met' ? 'CircleCheckFilled' : c.state === 'unmet' ? 'CircleCloseFilled' : 'QuestionFilled'" />
                  </el-icon>
                  <div>
                    <div class="name">{{ c.name }}</div>
                    <div class="note">{{ c.note }}</div>
                  </div>
                </div>
              </div>

              <el-alert v-if="rule.blockers && rule.blockers.length" type="warning" :closable="false" show-icon style="margin-top:14px">
                <template #title>当前阻塞项（{{ rule.blockers.length }}）</template>
                <div v-for="(b, i) in rule.blockers" :key="i" style="font-size:13px;line-height:1.9">· {{ b.text }}</div>
              </el-alert>
            </div>
          </div>
        </div>

        <!-- 等级核实：107 号令第七条的「较低数额罚款」是两个条件同时成立 -->
        <div v-if="rule.levelCheck" class="card card-pad" style="margin-top:18px">
          <div class="card-title"><span class="bar"></span>等级核实（罚款金额 × 裁量阶次）</div>
          <div class="muted tiny" style="margin-bottom:12px;line-height:1.9">
            《市场监督管理信用修复管理办法》第七条：较低数额罚款是指<strong>按照从轻或者减轻处罚的裁量阶次</strong>，对经营主体处以<strong>五万元以下</strong>罚款。两个条件必须同时成立——只按金额判断会把「一般阶次、罚 3 万」误判成轻微，可申请日随之算错。
          </div>
          <div class="kv" style="display:grid;grid-template-columns:110px 1fr;gap:8px 14px;font-size:13px">
            <div class="muted">罚款金额</div>
            <div>{{ rule.levelCheck.fineAmount == null ? '未登记' : rule.levelCheck.fineAmount.toLocaleString() + ' 元' }}</div>
            <div class="muted">裁量阶次</div>
            <div>{{ rule.levelCheck.discretionLabel || '未登记' }}</div>
            <div class="muted">金额上限</div>
            <div>{{ rule.levelCheck.fineCap.toLocaleString() }} 元（经营主体）</div>
            <div class="muted">核实结论</div>
            <div :style="{ color: rule.levelCheck.state === 'conflict' ? 'var(--bad)' : rule.levelCheck.state === 'warn' ? 'var(--warn)' : rule.levelCheck.state === 'unknown' ? 'var(--warn)' : 'var(--ok)' }">
              {{ { ok: '与登记等级一致', warn: '建议复核等级', conflict: '与法条要件冲突', unknown: '要件缺失，暂不判断' }[rule.levelCheck.state] }}
            </div>
          </div>
          <div class="tiny" style="margin-top:10px;line-height:1.9">{{ rule.levelCheck.text }}</div>
          <div class="row" style="margin-top:12px">
            <el-button size="small" @click="openFacts">去登记罚款金额与裁量阶次</el-button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:18px">
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>{{ rule.support && !rule.support.autoJudgeable ? '材料参考清单' : '需要准备的材料' }}（{{ rule.materials.length }} 份）</div>
            <div v-for="(m, i) in rule.materials" :key="m.key" class="spread" style="padding:10px 0;border-bottom:1px dashed var(--line)">
              <div>
                <span class="muted mono" style="margin-right:10px">{{ String(i + 1).padStart(2, '0') }}</span>
                <span style="font-size:14px">{{ m.title }}</span>
              </div>
              <el-tag size="small" effect="plain">{{ docStatus(m.key) }}</el-tag>
            </div>
          </div>
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>法律依据</div>
            <div v-for="b in rule.basis" :key="b.law" style="margin-bottom:14px">
              <div style="font-size:13px;font-weight:500">{{ b.law }}</div>
              <div class="muted tiny" style="margin-top:4px;line-height:1.7">{{ b.text }}</div>
            </div>
            <div v-if="!rule.basis || !rule.basis.length" class="muted tiny" style="line-height:1.9">
              该类情形尚未录入经复核的规则版本，平台不提供法律依据与结论。请以受理机关公布的现行文件为准。
            </div>
          </div>
        </div>

        <div v-if="rule.rejectReasons && rule.rejectReasons.length" class="card card-pad" style="margin-top:18px">
          <div class="card-title"><span class="bar"></span>常见驳回原因（{{ rule.rejectReasons.length }}）</div>
          <div class="muted tiny" style="margin-bottom:10px;line-height:1.8">以下为该类情形在实务中被退回的常见原因，来自规则版本登记，提交前请逐条自查。</div>
          <div v-for="(r, i) in rule.rejectReasons" :key="i" style="padding:8px 0;border-bottom:1px dashed var(--line);font-size:14px;line-height:1.8">
            <span class="muted mono" style="margin-right:10px">{{ String(i + 1).padStart(2, '0') }}</span>{{ r }}
          </div>
        </div>

        <div class="card card-pad" style="margin-top:18px">
          <div class="card-title"><span class="bar"></span>风险提示</div>
          <div v-if="rule.ruleVersion" class="card card-pad" style="margin-bottom:12px">当前匹配：{{rule.ruleVersion.title}} · v{{rule.ruleVersion.version}}<p class="muted">{{rule.ruleVersion.authority_match}} · {{rule.ruleVersion.effective_from}} 起生效</p><a :href="rule.ruleVersion.source_url" target="_blank" rel="noopener noreferrer">查看规则来源</a></div>
          <el-collapse v-if="data.diagnosisHistory?.length" style="margin-bottom:14px"><el-collapse-item title="历史诊断快照（保留当时事实及规则）"><div v-for="h in data.diagnosisHistory" :key="h.id" style="margin:10px 0"><strong>{{h.created_at}}</strong><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{{JSON.stringify(h.content,null,2)}}</pre><span class="muted tiny">{{h.digest}}</span></div></el-collapse-item></el-collapse>
          <el-alert v-for="(w, i) in rule.warnings" :key="i" :title="w.text" :type="w.level === 'bad' ? 'error' : w.level" :closable="false" show-icon style="margin-bottom:10px" />
        </div>

        <!-- 免责声明（第四层中的界面层）：结论只在平台内有效，导出与对外使用另见 PDF 页脚 -->
        <div class="card card-pad disclaimer" style="margin-top:18px">
          <div class="card-title"><span class="bar"></span>使用说明与免责声明</div>
          <p>一、本平台是自助辅助工具，<strong>不能提交信用修复申请</strong>。信用修复申请的唯一受理渠道是「信用中国」网站以及作出决定的市场监督管理部门；平台不代办、不代提交、不承诺办理结果。</p>
          <p>二、诊断结论依据企业自行登记的事实与平台登记的规则版本自动计算，<strong>不构成行政机关的认定</strong>。事实登记不全或登记错误，结论会随之出错；最终是否受理、是否修复，以受理机关的决定为准。</p>
          <p>三、平台生成的材料为草稿模板，需企业核对后自行签署、自行提交；平台不代替企业作出承诺，也不对材料内容承担法律责任。</p>
          <p>四、如平台判断与官方口径不一致，<strong>以官方口径为准</strong>，请通过「信用中国」或受理机关公开渠道复核。</p>
        </div>
      </el-tab-pane>

      <!-- 材料 -->
      <el-tab-pane label="材料工坊" name="docs">
        <div class="doc-layout">
          <div class="card card-pad doc-list">
            <div class="card-title"><span class="bar"></span>材料清单</div>
            <div v-for="d in docs" :key="d.key" class="doc-item" :class="{ active: d.key === activeDoc }" @click="activeDoc = d.key">
              <div class="t">{{ d.title }}</div>
              <div class="s">
                <span v-if="d.status === 'template'">模板 · 未定稿</span>
                <span v-else-if="d.status === 'ai'">AI 润色 · 已保存草稿</span>
                <span v-else>手工修改 · 已保存草稿</span>
              </div>
            </div>
            <el-divider style="margin:14px 0" />
            <el-button size="small" style="width:100%;margin-bottom:8px" :loading="checking" @click="doCheck">跨文书一致性校验</el-button>
            <el-alert v-if="checkResult" :title="`校验${checkResult.valid ? '通过' : '未通过'}，参考分 ${checkResult.score}`" :type="checkResult.valid ? 'success' : 'warning'" :closable="false" show-icon />
          </div>

          <div class="card card-pad">
            <div class="spread" style="margin-bottom:14px">
              <div class="card-title" style="margin:0"><span class="bar"></span>{{ currentDoc?.title }}</div>
              <div class="row">
                <el-button size="small" :icon="MagicStick" :loading="polishing" :disabled="!aiOn" @click="polish">AI 润色</el-button>
                <el-button size="small" :icon="RefreshLeft" @click="resetDoc">恢复模板</el-button>
                <el-button size="small" :icon="Download" @click="exportPdf">导出 PDF</el-button>
              </div>
            </div>
            <el-alert v-if="!aiOn" title="未配置 AI 密钥，当前为模板文本。配置后可使用「AI 润色」生成更贴合企业情况的表述。" type="info" :closable="false" show-icon style="margin-bottom:14px" />
            <DocumentEditor :case-id="caseId" :enterprise-id="data.case.enterprise_id" :doc="currentDoc" @saved="data.docs=$event;checkResult=null" />
            <div class="muted tiny" style="margin-top:12px;line-height:1.8">
              带 <span style="border-bottom:1px solid #C9A227">金色下划线</span> 的字段为事实锁定槽位，AI 与人工均不可修改，导出时作为书面事实保留。
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="证据附件" name="evidence">
        <EvidencePanel :case-id="caseId" :enterprise-id="data.case.enterprise_id" @changed="reload" />
      </el-tab-pane>
      <!-- 进度 -->
      <el-tab-pane label="办理进度" name="progress">
        <div class="card card-pad" style="margin-bottom:18px">
          <div class="spread" style="margin-bottom:12px">
            <div class="card-title" style="margin:0"><span class="bar"></span>当前阶段：{{ data.stage?.label }}</div>
            <div style="display:flex;gap:8px">
              <el-button v-for="a in (data.stage?.allowed || [])" :key="a.to" type="primary" plain size="small"
                :loading="advancing" @click="advance(a.to)">标记为{{ a.label }}</el-button>
            </div>
          </div>
          <el-progress :percentage="data.stage?.progress || 0" :stroke-width="10" />
          <div class="muted tiny" style="margin-top:8px">
            阶段只能按流程推进，跳步会被服务端拒绝；提交需满足诊断条件，提交、受理与退回需关联实际回执；修复需官方结果材料及移出日期。
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:18px">
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>流转记录</div>
            <el-timeline>
              <el-timeline-item v-for="t in data.timeline" :key="t.id" :timestamp="fmt(t.at)" placement="top"
                :type="t.at > now ? 'info' : 'primary'" :hollow="t.at > now">
                <div style="font-size:14px">{{ t.action }}</div>
                <div class="muted tiny">{{ t.actor }} · {{ t.detail }}</div>
              </el-timeline-item>
            </el-timeline>
          </div>
          <TaskPanel :case-id="caseId" :enterprise-id="data.case.enterprise_id" :tasks="data.tasks" :events="data.taskEvents" @changed="reload" />
        </div>
      </el-tab-pane>

      <!-- 同步监测 -->
      <el-tab-pane label="同步监测" name="sync">
        <MonitoringPanel :case-id="caseId" :kase="data.case" :enterprise="data.enterprise" @changed="reload" />
      </el-tab-pane>

      <!-- 办理进度记录（原「数字凭证」：平台自制文件不具行政效力，不作修复证明） -->
      <el-tab-pane label="办理进度记录" name="cert">
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom:16px">
          <template #title>本页生成的是「办理进度记录」，不是修复凭证，也不具行政效力</template>
          <div class="tiny" style="line-height:2">
            只有行政机关出具的《信用修复决定书》或移出决定，才能证明失信信息已完成修复。
            平台这份记录只说明「企业在什么时间、就哪一条失信信息、走到了哪一步」，用于内部留痕、向银行或招标方说明办理过程。
          </div>
          <div class="tiny" style="line-height:2">
            请勿把它当作已修复证明对外出示。对方要核实是否真的修复，应以「信用中国」公示状态或机关出具的正式文书为准。
          </div>
        </el-alert>
        <div style="display:grid;grid-template-columns:1fr 340px;gap:18px">
          <div class="card card-pad">
            <div class="spread" style="margin-bottom:14px">
              <div class="card-title" style="margin:0"><span class="bar"></span>信用修复办理进度记录</div>
              <el-button type="primary" size="small" :icon="Postcard" :loading="issuing" @click="issue">生成记录</el-button>
            </div>
            <el-empty v-if="!certs.length" description="尚未生成办理进度记录" :image-size="90" />
            <div v-for="c in certs" :key="c.code" class="cert-card" style="margin-bottom:16px">
              <div class="spread">
                <div>
                  <div class="muted tiny" style="color:#8FA9BE">记录编号</div>
                  <div class="code">{{ c.code }}</div>
                </div>
                <div class="cert-qr"><canvas :ref="el => setQr(el, c)"></canvas></div>
              </div>
              <div class="kv">
                <div class="k">企业</div><div>{{ data.enterprise.name }}</div>
                <div class="k">决定机关</div><div>{{ data.case.authority }}</div>
                <div class="k">生成日期</div><div>{{ fmtc(c.issued_at) }}</div>
                <div class="k">核对有效期至</div><div>{{ c.valid_until }}</div>
                <div class="k">内容摘要</div><div class="mono" style="word-break:break-all">{{ c.digest.slice(0, 32) }}…</div>
              </div>
              <div style="margin-top:16px" class="row">
                <el-button size="small" @click="openVerify(c.code)">核对页</el-button>
                <el-button size="small" @click="downloadCert(c.code)">下载 PDF</el-button>
                <el-button v-if="c.status==='valid'" size="small" type="danger" @click="revoke(c.code)">作废</el-button>
                <el-tag size="small">{{ {valid:'有效',revoked:'已作废',expired:'已过期'}[c.status] || c.status }}</el-tag>
              </div>
            </div>
          </div>
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>这份记录能做什么、不能做什么</div>
            <div style="font-size:13px;line-height:1.9;color:#33475b">
              <p style="margin-top:0"><strong>能做的</strong>：说明企业在哪一条失信信息上走到了哪一步、依据的是哪份决定和哪份材料，供内部归档、向银行或招标方说明办理过程。</p>
              <p>· 记录的是哪一条失信信息</p>
              <p>· 由哪个机关、依据哪份决定作出</p>
              <p>· 记录内容是否被改动（摘要重算）</p>
              <p>· 是否已被企业作废</p>
              <p style="margin-top:12px"><strong>不能做的</strong>：</p>
              <p>· 不能证明失信信息已完成修复，只有机关的修复决定或移出决定能证明</p>
              <p>· 不能被当作征信报告、资信证明或投标资格证明使用</p>
              <p class="muted" style="font-size:12px;margin-top:14px">
                记录采用链式存证：每条记录写入前一条的摘要，形成可追溯的哈希链。平台只证明「页面内容与留存的记录一致」，<strong>不替代行政机关的决定</strong>。
              </p>
            </div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="融资／投标分享" name="share"><SharePanel :enterprise-id="data.case.enterprise_id" :case-id="caseId" :certificates="certs"/></el-tab-pane>
    </el-tabs>

    <!-- 异议函 -->
    <el-dialog v-model="objOpen" title="数据异议与更正函" width="760px" top="6vh">
      <el-alert :title="`致：${objChannel?.channel_name}　当前状态：${objChannel?.note}`" type="warning" :closable="false" show-icon style="margin-bottom:14px" />
      <div class="paper" style="max-height:50vh;overflow:auto" v-html="objHtml"></div>
      <template #footer>
        <el-button @click="objOpen = false">关闭</el-button>
        <el-button type="primary" :loading="sending" @click="sendObjection">保存异议草稿</el-button>
      </template>
    </el-dialog>
  </div>

  <div v-else class="page"><el-skeleton :rows="8" animated /></div>
  <el-dialog v-model="stageDialog" title="登记实际办理回执" width="min(580px,94vw)">
    <el-alert title="请先上传本事项对应的提交、受理或退回回执，再登记实际办理情况。" type="info" :closable="false" style="margin-bottom:14px" />
    <el-form label-position="top"><el-form-item label="关联回执"><el-select v-model="stageForm.evidence_id" style="width:100%"><el-option v-for="f in stageReceipts" :key="f.id" :label="f.filename" :value="f.id" /></el-select></el-form-item><el-form-item label="办理 / 补正说明"><el-input v-model="stageForm.note" type="textarea" maxlength="500" /></el-form-item></el-form>
    <template #footer><el-button @click="stageDialog=false">取消</el-button><el-button type="primary" :loading="advancing" @click="saveStage">保存办理记录</el-button></template>
  </el-dialog>
  <!-- 补充事实：诊断结论只依据这里登记的事实 -->
  <el-dialog v-model="factsVisible" title="补充案件事实" width="520px">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:14px"
      title="诊断结论只依据这里登记的事实。未登记的项目会显示为「待确认」，不会默认通过。" />
    <el-form label-width="150px">
      <el-form-item label="义务履行完成日">
        <el-date-picker v-model="factForm.obligation_at" type="date" value-format="YYYY-MM-DD" placeholder="缴款 / 补报完成日期" style="width:100%" />
      </el-form-item>
      <!-- 107 号令第七条：较低数额罚款 = 从轻/减轻阶次 + 5 万元以下，两者缺一即不成立 -->
      <el-form-item v-if="data?.case?.type === 'penalty'" label="罚款金额（元）">
        <el-input v-model="factForm.fine_amount" placeholder="决定书载明的数额；未处罚款可留空" style="width:100%">
          <template #append>元</template>
        </el-input>
      </el-form-item>
      <el-form-item v-if="data?.case?.type === 'penalty'" label="处罚裁量阶次">
        <el-select v-model="factForm.discretion" placeholder="未登记（待确认）" style="width:100%">
          <el-option value="lighter" label="从轻处罚" />
          <el-option value="mitigated" label="减轻处罚" />
          <el-option value="normal" label="一般（适中）处罚" />
          <el-option value="heavier" label="从重处罚" />
          <el-option :value="null" label="未登记（待确认）" />
        </el-select>
      </el-form-item>
      <div v-if="data?.case?.type === 'penalty'" class="muted tiny" style="line-height:1.8;margin:-6px 0 14px 150px">
        裁量阶次须按决定书载明的「从轻／减轻／一般／从重」填写。仅罚 3 万元但阶次为「一般」，依法仍属一般失信，不能按轻微处理。
      </div>
      <el-form-item label="整改是否完成">
        <el-select v-model="factForm.rectified" placeholder="未登记" style="width:100%">
          <el-option :value="1" label="已完成" />
          <el-option :value="0" label="未完成" />
          <el-option :value="null" label="未登记（待确认）" />
        </el-select>
      </el-form-item>
      <el-form-item label="整改完成日">
        <el-date-picker v-model="factForm.rectify_at" type="date" value-format="YYYY-MM-DD" placeholder="整改复查通过日期" style="width:100%" />
      </el-form-item>
      <el-form-item label="官方登记移出日期"><el-date-picker v-model="factForm.removed_date" type="date" value-format="YYYY-MM-DD" placeholder="以官方修复结果材料为准" style="width:100%" /></el-form-item>
      <el-form-item label="近12个月无新增同类">
        <el-select v-model="factForm.no_new_similar" placeholder="未登记" style="width:100%">
          <el-option :value="1" label="无新增（符合）" />
          <el-option :value="0" label="有新增（不符合）" />
          <el-option :value="null" label="未核查（待确认）" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="factsVisible = false">取消</el-button>
      <el-button type="primary" :loading="savingFacts" @click="saveFacts">保存并重新诊断</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import TaskPanel from '../components/TaskPanel.vue'
import MonitoringPanel from '../components/MonitoringPanel.vue'
import DocumentEditor from '../components/DocumentEditor.vue'
import EvidencePanel from '../components/EvidencePanel.vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import SharePanel from '../components/SharePanel.vue'
import QRCode from 'qrcode'
import { api } from '../api.js'

const route = useRoute()
const router = useRouter()
const data = ref(null)
// 可切换的页签；只有 URL 显式带了合法 tab（如看板快捷卡）才沿用，否则一律落在「智能诊断」
const TAB_NAMES = ['diagnose', 'docs', 'evidence', 'progress', 'sync', 'cert', 'share']
const tab = ref(TAB_NAMES.includes(route.query.tab) ? route.query.tab : 'diagnose')
const activeDoc = ref('apply')
const aiOn = ref(false)
const polishing = ref(false)
const scanning = ref(false)
const issuing = ref(false)
const checking = ref(false)
const diagnosing = ref(false)
const checkResult = ref(null)
const certs = ref([])
const objOpen = ref(false)
const objChannel = ref(null)
const objHtml = ref('')
const sending = ref(false)
const qrEls = new Map()

const now = new Date().toISOString()
const caseId = computed(() => route.params.id)
const rule = computed(() => data.value?.rule || { conditions: [], materials: [], basis: [], warnings: [], score: 0 })

const statusText = computed(() => {
  // 轻微失信是「到期由机关停止公示」，不需要企业申请，不能再显示「可申请」
  if (rule.value.autoStopOnly) return rule.value.eligible || rule.value.applyFrom ? '无需申请' : '待核实'
  return {
    needs_review:'待复核适用规则', eligible: '可申请', not_yet: `还需 ${rule.value.waitDays || 0} 天`,
    pending_facts: '待补充事实', blocked: '暂不符合'
  }[rule.value.status] || (rule.value.eligible ? '可申请' : '待确认')
})

// —— 补充事实
const factsVisible = ref(false)
const savingFacts = ref(false)
const factForm = ref({ obligation_at: '', rectified: null, rectify_at: '', no_new_similar: null, removed_date: '', fine_amount: '', discretion: null })

function openFacts() {
  const c = data.value?.case || {}
  factForm.value = {
    obligation_at: c.obligation_at || '',
    rectified: c.rectified === 1 ? 1 : c.rectified === 0 ? 0 : null,
    rectify_at: c.rectify_at || '',
    no_new_similar: c.no_new_similar === 1 ? 1 : c.no_new_similar === 0 ? 0 : null,
    removed_date:c.removed_date||'',
    fine_amount: c.fine_amount == null ? '' : String(Number(c.fine_amount)),
    discretion: c.discretion || null
  }
  factsVisible.value = true
}

async function saveFacts() {
  savingFacts.value = true
  try {
    await api.facts(caseId.value, factForm.value)
    ElMessage.success('事实已更新，诊断结论已重新计算')
    factsVisible.value = false
    await reload()
  } catch (e) { ElMessage.error(e.message) } finally { savingFacts.value = false }
}

// —— 阶段推进
const advancing=ref(false),stageDialog=ref(false),stageForm=ref({}),stageReceipts=ref([])
async function advance(to){
  if(['submitted','reviewing','rejected'].includes(to)){
    try{stageReceipts.value=(await api.evidence(caseId.value)).items.filter(f=>f.kind==='receipt'&&!f.archived);stageForm.value={to,note:'',evidence_id:null};stageDialog.value=true}catch(e){ElMessage.error(e.message)}
    return
  }
  await commitStage(to,'',null)
}
async function commitStage(to,note,evidenceId){
  advancing.value=true
  try{await api.stage(caseId.value,to,note,evidenceId);stageDialog.value=false;ElMessage.success('阶段和依据已登记');await reload()}catch(e){ElMessage.error(e.message)}finally{advancing.value=false}
}
function saveStage(){return commitStage(stageForm.value.to,stageForm.value.note,stageForm.value.evidence_id)}
const docs = computed(() => data.value?.docs || [])
const currentDoc = computed(() => docs.value.find(d => d.key === activeDoc.value))

const fmt = s => String(s || '').replace('T', ' ').slice(0, 16)
const fmtc = s => String(s || '').slice(0, 10)
const stateType = s => ({ ok: 'success', warn: 'warning', bad: 'danger', idle: 'info' }[s] || 'info')
const stateLabel = s => ({ ok: '已同步', warn: '部分同步', bad: '未同步', idle: '待核验' }[s] || s)
const taskLabel = s => ({ todo: '待办', doing: '进行中', done: '已完成' }[s] || s)
const docStatus = key => {
  const d = docs.value.find(x => x.key === key)
  if (!d) return '未生成'
  return d.status === 'template' ? '模板' : '已保存草稿'
}

async function reload() {
  const r = await api.caseDetail(caseId.value)
  data.value = r
  const list = await api.certs(caseId.value)
  certs.value = list.items
  await nextTick()
  drawQrs()
}

function drawQrs() {
  for (const c of certs.value) {
    const el = qrEls.get(c.code)
    if (el) QRCode.toCanvas(el, `${location.origin}/verify?code=${c.code}`, { width: 96, margin: 1 })
  }
}

const setQr = (el, c) => { if (el) qrEls.set(c.code, el) }

async function rediagnose() {
  diagnosing.value = true
  try {
    const r = await api.diagnose(caseId.value)
    data.value.rule = r.diagnosis
    ElMessage.success(`诊断完成：${r.diagnosis.levelLabel}，完备度 ${r.diagnosis.score}`)
  } catch (e) { ElMessage.error(e.message) } finally { diagnosing.value = false }
}

async function polish() {
  polishing.value = true
  try {
    const r = await api.polish(caseId.value, activeDoc.value)
    if (!r.degraded) {
      data.value.docs = r.docs
      ElMessage.success('AI 润色完成，已保存定稿')
    } else ElMessage.warning(r.reason || 'AI 不可用，已保留模板')
  } catch (e) { ElMessage.error(e.message) } finally { polishing.value = false }
}

async function resetDoc() {
  try {
    await ElMessageBox.confirm('恢复系统模板会新增版本，现有记录仍保留，确定？', '恢复模板')
    const r = await api.resetDoc(caseId.value, activeDoc.value)
    data.value.docs = r.docs
    ElMessage.success('已恢复模板')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

async function exportPdf() {
  try { const r=await api.docCheck(caseId.value,activeDoc.value);checkResult.value=r.check;
    if(!r.check.valid){ElMessage.warning('校验未通过，请先补齐材料并纠正事实字段');return}
  } catch(e){ElMessage.error(e.message);return}
  window.open(`/api/pdf/doc?case=${caseId.value}&key=${activeDoc.value}`, '_blank')
}

async function doCheck() {
  checking.value = true
  try {
    const r = await api.docCheck(caseId.value,activeDoc.value)
    checkResult.value = r.check
    ElMessage[r.check.valid?'success':'warning'](`校验${r.check.valid?'通过':'未通过'}：${r.check.issues.length} 项事实问题，${r.check.missing.length} 份待完善材料`)
  } catch (e) { ElMessage.error(e.message) } finally { checking.value = false }
}

async function toggleTask(t, v) {
  try {
    await api.taskStatus(t.id, v ? 'done' : 'todo')
    t.status = v ? 'done' : 'todo'
  } catch (e) { ElMessage.error(e.message) }
}

async function doRescan() {
  scanning.value = true
  try {
    const r = await api.rescan(caseId.value)
    data.value.channels = r.latest.channels
    ElMessage.success(`巡检完成，${r.run.diffs} 个渠道状态变化`)
  } catch (e) { ElMessage.error(e.message) } finally { scanning.value = false }
}

async function openObjection(c) {
  objChannel.value = c
  objOpen.value = true
  objHtml.value = '<div class="muted">生成中…</div>'
  try {
    const r = await api.objectionPreview(caseId.value, c.channel_code)
    objHtml.value = r.html
  } catch (e) { objHtml.value = `<div class="muted">${e.message}</div>` }
}

async function sendObjection() {
  sending.value = true
  try {
    await api.sendObjection(caseId.value, objChannel.value.channel_code)
    ElMessage.success('异议草稿已生成，尚未实际提交')
    objOpen.value = false
    await reload()
  } catch (e) { ElMessage.error(e.message) } finally { sending.value = false }
}

async function issue() {
  issuing.value = true
  try {
    await api.issueCert(caseId.value)
    const list = await api.certs(caseId.value)
    certs.value = list.items
    await nextTick()
    drawQrs()
    ElMessage.success('办理进度记录已生成（不具行政效力，不作修复证明）')
  } catch (e) { ElMessage.error(e.message) } finally { issuing.value = false }
}

async function revoke(code){try{const {value}=await ElMessageBox.prompt('请填写作废原因','作废办理进度记录');await api.revokeCert(code,value);await reload();ElMessage.success('记录已作废')}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}}
function openVerify(code) { window.open(`/verify?code=${code}`, '_blank') }
function downloadCert(code) { window.open(`/api/pdf/cert?code=${code}`, '_blank') }

watch(tab, t => router.replace({ query: { ...route.query, tab: t } }))

onMounted(async () => {
  await reload()
  try { aiOn.value = (await api.aiStatus()).available } catch { aiOn.value = false }
})
</script>

<style scoped>
.case-tabs :deep(.el-tabs__header) { margin-bottom: 18px; }
.case-tabs :deep(.el-tabs__item) { font-size: 14px; }
.case-tabs :deep(.el-tabs__content) { min-height: 430px; }
.disclaimer p { margin: 0 0 8px; font-size: 12.5px; line-height: 1.9; color: #4A5A6A; }
.disclaimer p:last-child { margin-bottom: 0; }
.disclaimer strong { color: #0F2A44; }
</style>
