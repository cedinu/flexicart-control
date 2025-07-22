// src/commands/vtr_commands.js
// Centralized VTR command definitions for Flexicart-Control

/**
 * VTR RS-422 command definitions.
 * CMD-1/MSD and CMD-2/LSD per Sony BVW/DVW/DNW/HDW/J/MSW/SRW series protocol.
 */
const COMMANDS = {
  // System Control
  LOCAL_DISABLE:           { cmd1: 0x00, cmd2: 0x0C },    // 00.0C
  LOCAL_ENABLE:            { cmd1: 0x00, cmd2: 0x1D },    // 00.1D
  DEVICE_TYPE_REQ:         { cmd1: 0x00, cmd2: 0x11 },    // 00.11

  // Acknowledgement
  ACK:                     { cmd1: 0x10, cmd2: 0x01 },    // 10.01
  NAK:                     { cmd1: 0x11, cmd2: 0x12 },    // 11.12

  // Transport Control
  STOP:                    { cmd1: 0x20, cmd2: 0x00 },    // 20.00
  PLAY:                    { cmd1: 0x20, cmd2: 0x01 },    // 20.01
  REC:                     { cmd1: 0x20, cmd2: 0x02 },    // 20.02
  STANDBY_OFF:             { cmd1: 0x20, cmd2: 0x04 },    // 20.04
  STANDBY_ON:              { cmd1: 0x20, cmd2: 0x05 },    // 20.05
  DMC_START:               { cmd1: 0x20, cmd2: 0x0D },    // 20.0D
  EJECT:                   { cmd1: 0x20, cmd2: 0x0F },    // 20.0F
  FAST_FORWARD:            { cmd1: 0x20, cmd2: 0x10 },    // 20.10
  REWIND:                  { cmd1: 0x20, cmd2: 0x20 },    // 20.20

  // Preroll / Cue / Program
  PREROLL:                 { cmd1: 0x20, cmd2: 0x30 },    // 20.30fileciteturn1file13
  CUE_UP_WITH_DATA:        { cmd1: 0x24, cmd2: 0x31 },    // 24.31fileciteturn1file13
  SYNC_PLAY:               { cmd1: 0x20, cmd2: 0x34 },    // 20.34fileciteturn1file13
  PROGRAM_PLAY_PLUS:       { cmd1: 0x21, cmd2: 0x38 },    // 21.38fileciteturn1file13
  PROGRAM_PLAY_MINUS:      { cmd1: 0x21, cmd2: 0x39 },    // 21.39fileciteturn1file13
  DMC_PREROLL:             { cmd1: 0x20, cmd2: 0x3C },    // 20.3Cfileciteturn1file13

  // Preview / Review / Auto Edit
  PREVIEW:                 { cmd1: 0x20, cmd2: 0x40 },    // 20.40fileciteturn1file13
  REVIEW:                  { cmd1: 0x20, cmd2: 0x41 },    // 20.41fileciteturn1file13
  AUTO_EDIT:               { cmd1: 0x20, cmd2: 0x42 },    // 20.42fileciteturn1file13

  // Dynamic Motion Control (DMC)
  DMC_RUN:                 { cmd1: 0x20, cmd2: 0x4B },    // 20.4Bfileciteturn1file13
  DMC_PREVIEW:             { cmd1: 0x20, cmd2: 0x4C },    // 20.4Cfileciteturn1file13
  DMC_SET_FWD:             { cmd1Base: 0x20, cmd2: 0x5C },// 2X.5Cfileciteturn1file13
  DMC_SET_REV:             { cmd1Base: 0x20, cmd2: 0x5D },// 2X.5Dfileciteturn1file13

  // Tension, Timer, Edit, Freeze
  TENSION_RELEASE:         { cmd1: 0x20, cmd2: 0x52 },    // 20.52fileciteturn1file13
  ANTI_CLOG_TIMER_DISABLE: { cmd1: 0x20, cmd2: 0x54 },    // 20.54fileciteturn1file13
  ANTI_CLOG_TIMER_ENABLE:  { cmd1: 0x20, cmd2: 0x55 },    // 20.55fileciteturn1file13
  FULL_EE_OFF:             { cmd1: 0x20, cmd2: 0x60 },    // 20.60fileciteturn1file13
  FULL_EE_ON:              { cmd1: 0x20, cmd2: 0x61 },    // 20.61fileciteturn1file13
  SELECT_EE_ON:            { cmd1: 0x20, cmd2: 0x63 },    // 20.63fileciteturn1file13
  EDIT_OFF:                { cmd1: 0x20, cmd2: 0x64 },    // 20.64fileciteturn1file13
  EDIT_ON:                 { cmd1: 0x20, cmd2: 0x65 },    // 20.65fileciteturn1file13
  FREEZE_OFF:              { cmd1: 0x20, cmd2: 0x6A },    // 20.6Afileciteturn1file13
  FREEZE_ON:               { cmd1: 0x20, cmd2: 0x6B },    // 20.6Bfileciteturn1file13
};

module.exports = { COMMANDS };
